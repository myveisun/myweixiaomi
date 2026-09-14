//go:build !production || darwin

package main

// Development builds look for Weixiaomi-<plat>.zip or
// Weixiaomi-portable-<plat>-*.zip beside the executable. macOS production
// copies the zip into Resources as Weixiaomi-<plat>.zip.
var embeddedPortable []byte
