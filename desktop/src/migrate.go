package main

import (
	"io"
	"os"
	"path/filepath"
)

// Sentinel written under the migrated data root once legacy data has been copied.
// Its content records the source directory this migration came from, so a later
// run with a different source can be distinguished (idempotency marker).
const migrateSentinel = ".migrated-from-legacy"

// skipOnMigrate are legacy-root entries that must NOT be copied to the new data
// root. The runtime tree (portable/, hundreds of MB) and the Playwright browser
// cache (browsers/, re-downloadable) are both reproducible and would bloat a
// migration for no benefit.
var skipOnMigrate = map[string]bool{
	"portable": true,
	"browsers": true,
}

// maybeMigrateLegacyData performs a one-time copy of historical ~/.octop data into
// the new data root (next to the EXE) when that target is empty/nonexistent and the
// legacy root actually holds user data. It never deletes the source. Failures are
// reported but non-fatal so the service still boots against the legacy data.
//
// Call this before ensurePortable() / any SQLite read in boot().
func maybeMigrateLegacyData() error {
	target := dataRoot()
	legacy := legacyHomeDir()
	if legacy == target {
		return nil
	}
	if migrated(target) {
		return nil
	}
	if !legacyHasData(legacy) {
		return nil
	}
	// Only migrate when the new root is empty (or absent): a non-empty target was
	// already provisioned and must win over a stale legacy copy.
	if populated(target) {
		return nil
	}
	if err := copyTree(legacy, target); err != nil {
		return err
	}
	return writeSentinel(target, legacy)
}

// migrated reports whether the data root has already absorbed a legacy migration.
func migrated(root string) bool {
	_, err := os.Stat(filepath.Join(root, migrateSentinel))
	return err == nil
}

// legacyHasData reports whether the legacy root holds user data worth carrying
// over (not merely a portable runtime extraction).
func legacyHasData(legacy string) bool {
	if _, err := os.Stat(filepath.Join(legacy, "octop.db")); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(legacy, "agents")); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(legacy, "config.json")); err == nil {
		return true
	}
	return false
}

// populated reports whether root exists and is non-empty.
func populated(root string) bool {
	entries, err := os.ReadDir(root)
	if err != nil {
		return false
	}
	return len(entries) > 0
}

// copyTree copies the contents of src into dst (which need not pre-exist),
// skipping the entries in skipOnMigrate. Directories and files are copied
// recursively using io.Copy so it works across volume boundaries (os.Rename does
// not). The source tree is left untouched.
func copyTree(src, dst string) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if skipOnMigrate[entry.Name()] {
			continue
		}
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyTree(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			linkTarget, err := os.Readlink(srcPath)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
				return err
			}
			if err := os.Symlink(linkTarget, dstPath); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(srcPath, dstPath, info.Mode()); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string, info os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Perm())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func writeSentinel(root, source string) error {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, migrateSentinel), []byte(source), 0o644)
}