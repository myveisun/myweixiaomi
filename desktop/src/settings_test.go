package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// homeEnv returns the environment variable the runtime reads for the user's
// home directory, so tests can relocate it (see os.UserHomeDir).
func homeEnv() string {
	if runtime.GOOS == "windows" {
		return "USERPROFILE"
	}
	return "HOME"
}

// swapExecutablePath points the os.Executable seam (settings.executablePath) at
// path for the duration of the test, then restores the original.
func swapExecutablePath(t *testing.T, path string) {
	t.Helper()
	orig := executablePath
	executablePath = func() (string, error) { return path, nil }
	t.Cleanup(func() { executablePath = orig })
}

// mustWrite creates a file (and its parent dirs) with the given content, failing
// the test on error.
func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadSettingsMigratesLegacyPreventSleepMac(t *testing.T) {
	temp := t.TempDir()
	t.Setenv("OCTOP_HOME", temp)
	if err := os.WriteFile(
		filepath.Join(temp, "desktop-settings.json"),
		[]byte(`{"preventSleepMac":true}`),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	if !loadSettings().PreventSleep {
		t.Fatal("legacy preventSleepMac should migrate to preventSleep")
	}
}

func TestDataRootPrefersOctopHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("OCTOP_HOME", home)
	// Even a writable EXE-adjacent dir must lose to OCTOP_HOME.
	t.Setenv(homeEnv(), t.TempDir())
	swapExecutablePath(t, filepath.Join(t.TempDir(), "Weixiaomi.exe"))

	if got := dataRoot(); got != home {
		t.Fatalf("dataRoot() = %q, want OCTOP_HOME %q", got, home)
	}
}

func TestDataRootUsesWritableExeDir(t *testing.T) {
	t.Setenv("OCTOP_HOME", "")
	exeDir := t.TempDir()
	swapExecutablePath(t, filepath.Join(exeDir, "Weixiaomi.exe"))

	want := filepath.Join(exeDir, "user-data")
	if got := dataRoot(); got != want {
		t.Fatalf("dataRoot() = %q, want %q (writable EXE dir)", got, want)
	}
}

// TestDataRootFallsBackToHome forces the EXE-adjacent candidate to be
// non-writable (its parent is a regular file), so dataRoot() must fall back to
// ~/.octop. This mirrors installing under read-only Program Files.
func TestDataRootFallsBackToHomeWhenExeDirUnwritable(t *testing.T) {
	t.Setenv("OCTOP_HOME", "")
	home := t.TempDir()
	t.Setenv(homeEnv(), home)
	// Path whose Dir component (blocker) is a file => MkdirAll fails.
	blocker := filepath.Join(t.TempDir(), "blocker")
	mustWrite(t, blocker, "x")
	swapExecutablePath(t, filepath.Join(blocker, "Weixiaomi.exe"))

	want := filepath.Join(home, ".octop")
	if got := dataRoot(); got != want {
		t.Fatalf("dataRoot() = %q, want %q (unwritable EXE dir)", got, want)
	}
}
