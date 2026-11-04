// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "linux")]
  {
    // Fix WebKitGTK 2.42+ DMA-BUF / Wayland hardware acceleration black screen on Linux
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
      std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
      std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
  }

  app_lib::run();
}
