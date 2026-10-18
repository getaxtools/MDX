mod app_setup;
mod commands;
mod documents;
mod open_requests;
mod platform;
mod storage;

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, arguments, working_folder| {
                open_requests::forward_second_instance(app, &arguments, &working_folder);
            },
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| app_setup::initialize(app))
        .on_window_event(open_requests::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::documents::open_document,
            commands::documents::pick_documents,
            commands::documents::check_path_statuses,
            commands::documents::take_startup_documents,
            commands::app_state::load_app_state,
            commands::app_state::save_app_state,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("MDX could not start: {error}");
        std::process::exit(1);
    }
}
