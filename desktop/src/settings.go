package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

type Locale string

const (
	LocaleZH Locale = "zh"
	LocaleEN Locale = "en"
)

// Settings is persisted at ~/.octop/desktop-settings.json
type Settings struct {
	Locale         Locale `json:"locale"`
	Autostart      bool   `json:"autostart"`
	MinimizeToTray bool   `json:"minimizeToTray"`
	PreventSleep   bool   `json:"preventSleep"`
	Port           int    `json:"port,omitempty"`
}

func defaultSettings() Settings {
	return Settings{
		Locale:         LocaleEN,
		Autostart:      false,
		MinimizeToTray: true,
		PreventSleep:   false,
		Port:           8088,
	}
}

// executablePath is a seam for tests; production resolves the real running binary.
var executablePath = os.Executable

// dirWritable reports whether we can create a probe file under dir (mkdir -p first).
// Used to decide whether data can live next to the EXE (e.g. NOT under Program Files
// where a normal user lacks write permission).
func dirWritable(dir string) bool {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false
	}
	probe := filepath.Join(dir, ".write-test")
	if err := os.WriteFile(probe, []byte("ok"), 0o644); err != nil {
		return false
	}
	_ = os.Remove(probe)
	return true
}

// dataRoot resolves the single data root directory with this priority:
//  1. OCTOP_HOME env var (highest — respects manual override and existing tests)
//  2. a "user-data" subdirectory next to the executable, when writable
//  3. fallback to ~/.octop (e.g. EXE under read-only Program Files)
func dataRoot() string {
	if v := os.Getenv("OCTOP_HOME"); v != "" {
		return v
	}
	if exe, err := executablePath(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "user-data")
		if dirWritable(candidate) {
			return candidate
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".octop"
	}
	return filepath.Join(home, ".octop")
}

func octopHome() string {
	return dataRoot()
}

func portableDir() string {
	return filepath.Join(octopHome(), "portable")
}

func settingsPath() string {
	return filepath.Join(octopHome(), "desktop-settings.json")
}

// legacyHomeDir returns the historical fixed data root used before data started
// following the EXE. Only used by the one-time data migration (see migrate.go).
func legacyHomeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".octop"
	}
	return filepath.Join(home, ".octop")
}

type settingsStore struct {
	mu  sync.Mutex
	cur Settings
}

func loadSettings() Settings {
	s := defaultSettings()
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		return s
	}
	_ = json.Unmarshal(data, &s)
	var legacy struct {
		PreventSleepMac bool `json:"preventSleepMac"`
	}
	_ = json.Unmarshal(data, &legacy)
	if !s.PreventSleep {
		s.PreventSleep = legacy.PreventSleepMac
	}
	if s.Port == 0 {
		s.Port = 8088
	}
	if s.Locale != LocaleZH {
		s.Locale = LocaleEN
	}
	return s
}

func (st *settingsStore) get() Settings {
	st.mu.Lock()
	defer st.mu.Unlock()
	return st.cur
}

func (st *settingsStore) save(next Settings) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	if next.Port == 0 {
		next.Port = 8088
	}
	if err := os.MkdirAll(octopHome(), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(settingsPath(), data, 0o644); err != nil {
		return err
	}
	st.cur = next
	return nil
}

func greenPlat() string {
	osName := runtime.GOOS
	arch := runtime.GOARCH
	switch osName {
	case "darwin":
		osName = "darwin"
	case "windows":
		osName = "windows"
	default:
		osName = "linux"
	}
	switch arch {
	case "arm64":
		arch = "arm64"
	default:
		arch = "amd64"
	}
	return osName + "-" + arch
}
