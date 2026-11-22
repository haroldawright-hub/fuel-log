# Fuel Log

A free, private nutrition tracker that runs in your phone's browser and installs to the home screen like an app. There's no account, no server and no AI service.

## What it does
- **Scan barcode**: live camera scan, looked up in [Open Food Facts](https://world.openfoodfacts.org) (free, millions of products). Products it doesn't know: scan the label once and it's saved to that barcode.
- **Scan label**: reads the Nutrition Facts panel on the phone itself (Tesseract.js). A calorie cross-check catches common misreads and highlights numbers to double-check.
- **Search**: about 115 common foods with USDA values (works offline), your saved and recent foods, and packaged products from Open Food Facts.
- **Log**: shows calories and macros per meal. A calendar colors each day by how close you were to your target.
- **Goals**: a Mifflin–St Jeor calculator, or set your own numbers.
- **Backup and restore**: saves your log to a file through the share sheet (Google Drive, iCloud Drive or Files) and merges it back in. On Android the file is a `.txt`, because Chrome won't share `.json` files.

## Where data lives
Everything is stored in the browser on your phone (`localStorage`). Only barcode numbers and search words are sent to Open Food Facts. Make a backup from **Goals → Your data** every couple of weeks.

On iPhone, add it to the Home Screen. Safari can clear website data that hasn't been opened for a while, but home-screen apps are exempt.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page layout, styles and security policy |
| `app.js` | App logic |
| `foods.js` | Built-in common foods table |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `*.png` | Home-screen install and icons |

## Hosting it free (GitHub Pages)
1. Create a free account at github.com.
2. Create a new **public** repository, e.g. `fuel-log`. Only the app code goes there; your food log never leaves your phone.
3. Choose **Add file → Upload files** and drag in every file in this folder except `README.md` (optional).
4. Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, then branch `main`, folder `/ (root)`, and Save.
5. After a minute it's live at `https://<your-username>.github.io/fuel-log/`. Open that on your phone and add it to the Home Screen.

The camera needs HTTPS, which GitHub Pages provides. To update the app later, upload the changed files again.

## Running locally
```bash
python3 -m http.server 8766
```
Open http://localhost:8766. The camera works on localhost in a desktop browser. On a phone it needs the HTTPS site.
