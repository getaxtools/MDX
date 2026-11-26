// The desktop app runs with Tauri's `freezePrototype`, which freezes Object.prototype before any
// script of the page runs; libraries that patch it, or assign over its methods, fail there only.
Object.freeze(Object.prototype);
