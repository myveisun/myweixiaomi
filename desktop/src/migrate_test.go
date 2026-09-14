package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestMaybeMigrateLegacyDataCopiesUserData verifies that user data under the
// legacy ~/.octop root is copied into the new EXE-relative data root, while the
// reproducible runtime tree (portable/) and browser cache (browsers/) are skipped.
func TestMaybeMigrateLegacyDataCopiesUserData(t *testing.T) {
	home := t.TempDir()
	target := t.TempDir()
	t.Setenv(homeEnv(), home)
	t.Setenv("OCTOP_HOME", target)

	mustWrite(t, filepath.Join(home, "octop.db"), "db")
	mustWrite(t, filepath.Join(home, "config.json"), "{}")
	mustWrite(t, filepath.Join(home, "agents", "A1", "workspace.txt"), "hi")
	mustWrite(t, filepath.Join(home, "portable", "runtime.bin"), "big")
	mustWrite(t, filepath.Join(home, "browsers", "chromium", "chrome.exe"), "bin")

	if err := maybeMigrateLegacyData(); err != nil {
		t.Fatalf("maybeMigrateLegacyData() error: %v", err)
	}

	for _, rel := range []string{"octop.db", "config.json", "agents/A1/workspace.txt"} {
		got := filepath.Join(target, filepath.FromSlash(rel))
		if _, err := os.Stat(got); err != nil {
			t.Errorf("expected migrated file %q: %v", rel, err)
		}
	}
	for _, rel := range []string{"portable", "browsers"} {
		if _, err := os.Stat(filepath.Join(target, rel)); err == nil {
			t.Errorf("migration should skip %q", rel)
		}
	}
	if !migrated(target) {
		t.Error("expected sentinel to be written after migration")
	}
}

// TestMaybeMigrateSkipsWhenTargetPopulated ensures a target that already holds
// content is never overwritten by a stale legacy copy.
func TestMaybeMigrateSkipsWhenTargetPopulated(t *testing.T) {
	home := t.TempDir()
	target := t.TempDir()
	t.Setenv(homeEnv(), home)
	t.Setenv("OCTOP_HOME", target)

	mustWrite(t, filepath.Join(home, "octop.db"), "db")
	mustWrite(t, filepath.Join(target, "existing.txt"), "x")

	if err := maybeMigrateLegacyData(); err != nil {
		t.Fatalf("maybeMigrateLegacyData() error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(target, "octop.db")); err == nil {
		t.Error("should not migrate into a populated target")
	}
}

// TestMaybeMigrateSkipsWhenNoLegacyData verifies the sentinel is not written when
// the legacy root holds no user data to carry over.
func TestMaybeMigrateSkipsWhenNoLegacyData(t *testing.T) {
	home := t.TempDir()
	target := t.TempDir()
	t.Setenv(homeEnv(), home)
	t.Setenv("OCTOP_HOME", target)

	if err := maybeMigrateLegacyData(); err != nil {
		t.Fatalf("maybeMigrateLegacyData() error: %v", err)
	}
	if migrated(target) {
		t.Error("should not write sentinel when there is no legacy data")
	}
}

// TestMaybeMigrateNoopWhenSameRoot verifies no migration happens when the legacy
// root and the data root are identical (e.g. OCTOP_HOME already points at ~/.octop).
func TestMaybeMigrateNoopWhenSameRoot(t *testing.T) {
	home := t.TempDir()
	t.Setenv(homeEnv(), home)
	t.Setenv("OCTOP_HOME", home)
	mustWrite(t, filepath.Join(home, "octop.db"), "db")

	if err := maybeMigrateLegacyData(); err != nil {
		t.Fatalf("maybeMigrateLegacyData() error: %v", err)
	}
	if migrated(home) {
		t.Error("should not write sentinel when legacy == target")
	}
}

// TestMaybeMigrateIdempotent verifies a second run is a no-op once the target has
// been provisioned (populated), and the database survives.
func TestMaybeMigrateIdempotent(t *testing.T) {
	home := t.TempDir()
	target := t.TempDir()
	t.Setenv(homeEnv(), home)
	t.Setenv("OCTOP_HOME", target)
	mustWrite(t, filepath.Join(home, "octop.db"), "db")

	if err := maybeMigrateLegacyData(); err != nil {
		t.Fatal(err)
	}
	if err := maybeMigrateLegacyData(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(target, "octop.db")); err != nil {
		t.Fatalf("migrated db missing after second run: %v", err)
	}
}