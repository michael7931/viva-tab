# viva tab

[中文文档](./README_zh.md)

A tab organizer for **Vivaldi Workspaces**.

OneTab is well suited to organizing tabs by window, but it is not aware of Vivaldi's workspace structure. `viva tab` organizes tabs by workspace and preserves the workspace associated with each archive.

> [!WARNING]
> Vivaldi does not provide an official API for workspaces. To read and restore workspaces, this project requires an additional JSMod installation and depends on Vivaldi internal APIs. It may stop working after Vivaldi updates; assess the risk before using it.

## Development environment

| Item | Version |
| --- | --- |
| Operating system | macOS 15.7.7 |
| Browser | Vivaldi 8.0.4033.50 |

## Features

- Archive tabs from the current workspace or a specified workspace.
- Browse archives by workspace and search archive titles, tab titles, and URLs.
- Restore an entire archive, restore and delete an archive, or open individual tabs from it.
- Restore an archive into the current workspace after opening the archive page from the target workspace.
- Configure archive retention, duplicate URLs, pinned tabs, context menus, and toolbar icon behavior.
- Remove leftover temporary archives and copy debug information.

## Installation

Both steps are required. Installing only the browser extension does not grant access to Vivaldi workspaces.

### 1. Install the browser extension

1. Open `vivaldi://extensions` in the Vivaldi address bar.
2. Enable **Developer mode** in the upper-right corner.
3. Drag the [`vws-extension`](./vws-extension) directory onto the page, or click **Load unpacked** and select that directory.
4. Optionally pin the `viva tab` toolbar icon.

### 2. Install JSMod (macOS)

Quit Vivaldi, then run the following in a terminal:

```bash
cd /path/to/viva-tab/vws-jsmod
bash install.sh
```

The script requests administrator privileges and writes the bridge script to the default `/Applications/Vivaldi.app` installation. When it finishes, **fully quit and reopen Vivaldi**; closing the window alone is not enough.

After installation, click the extension icon. The configuration is ready when the status reads “Connected to JSMod”.

> [!NOTE]
> The current `install.sh` supports only the macOS version of Vivaldi installed at `/Applications/Vivaldi.app`. Linux, Windows, and custom installation paths require manual adaptation of the script.

## Usage

1. Open the extension popup or archive page, then select **Archive current workspace**. Archived tabs are closed from the current workspace.
2. Filter archives by workspace or search archives and URLs on the archive page.
3. To restore an archive to its original workspace, manually switch to that workspace in Vivaldi, then open `viva tab` from that workspace and choose **Restore all** or **Restore and delete**. You can also restore individual tabs.
4. Adjust whether restored archives are deleted, whether pinned tabs are archived, whether duplicate URLs are allowed, and other options in **Settings**.

## Updating

For each release, carry out the action corresponding to the changed files:

| Changed files | Required action |
| --- | --- |
| `vws-extension/**` | Reload the extension in `vivaldi://extensions`. |
| `vws-jsmod/**` | Run `bash vws-jsmod/install.sh` again to overwrite the installed JSMod, then fully quit and restart Vivaldi. |

If both directories change in the same release, both actions are required. A Vivaldi upgrade can also overwrite JSMod; in that case, rerun the installation script and restart the browser even if the extension itself has not changed.

## Project structure

| Directory | Responsibility |
| --- | --- |
| [`vws-extension`](./vws-extension) | Manifest V3 extension providing the popup, archive page, settings, and context menu. |
| [`vws-jsmod`](./vws-jsmod) | Bridge script injected into Vivaldi's `window.html`; it uses internal APIs to manage workspaces and session archives. |

## Known limitations

- There is no public workspace API, so the implementation relies on undocumented Vivaldi internal interfaces that may change.
- **Automatically restoring to an archive's original workspace is not implemented.** Because the Workspaces API is unavailable, you must first manually switch to the target workspace, then open `viva tab` there and perform the restore.
- Archives use Vivaldi session data. They are not an independent cloud-sync or backup system.
- JSMod modifies application resources; Vivaldi upgrades, reinstallation, or integrity checks can make it stop working.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| “JSMod is not responding” | Run `vws-jsmod/install.sh` again, then fully quit and restart Vivaldi. |
| The installation script cannot find Vivaldi | Confirm that the application is located at `/Applications/Vivaldi.app`, or update `install.sh` for the actual installation path. |
| Workspace restore results are unexpected | On the archive page, click **Copy debug information** and retain the Vivaldi version, reproduction steps, and copied debug output. |

## Disclaimer

This project modifies Vivaldi application resources and calls undocumented interfaces. Before working with important data, back up browser sessions or bookmarks. Users are responsible for data issues caused by browser updates, interface changes, or failed restores.
