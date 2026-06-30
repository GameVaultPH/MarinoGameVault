# Marino Game Vault

A complete static GitHub Pages website for **MARINO GAME VAULT**, a premium catalog and order builder for a plug-and-play Windows PC gaming hard drive collection.

## Project Features

- Premium black and gold gaming retail design
- Responsive mobile-first layout
- Featured games carousel
- Top 10 popular games section
- Recently added games section
- Live search by game title or genre
- Compact sticky catalog controls on desktop
- Category filters
- Low, Mid, High, and All graphics filters with CPU/GPU reference specifications
- Game cards with cover art, genre, size, and controller support
- Add to selection sidebar
- Premium hover previews and refined selected-game styling
- Collapsible floating build summary
- LocalStorage persistence for selected games
- Drive capacity calculator using real usable capacities for 500GB, 1TB, 2TB, 4TB, 5TB, and 8TB
- Customer order sheet generator
- Responsive checkout-style customer order section
- Clean PDF export with customer details, selected games, order instructions, and Marino Game Vault branding
- Admin helper page for adding, editing, deleting, importing, and exporting game catalog entries
- Admin drive inventory controls with automatic sold-out buttons
- Game request form saved in browser LocalStorage
- Compatibility section for Windows laptops, desktops, and handheld gaming PCs
- Installation guide and troubleshooting section
- Smooth scroll, reveal animations, loading screen, and back-to-top button
- SEO meta tags and accessible markup

## Folder Structure

```text
marino-searies-game-vault/
  index.html
  css/
    style.css
  js/
    app.js
  data/
    games.json
    drive-stock.json
    devices.json
  images/
    logo.png
    hero.jpg
    covers-webp/
      game-cover-images.webp
  README.md
```

## GitHub Pages Deployment Steps

1. Create a new GitHub repository.
2. Upload every file and folder from `marino-searies-game-vault`.
3. Open the repository settings.
4. Go to **Pages**.
5. Set the source to the main branch and root folder.
6. Save the settings.
7. Open the GitHub Pages link after deployment finishes.

No backend, database, or build process is required.

## Customization Guide

### Change Branding

- Replace `images/logo.png` with a new logo.
- Replace `images/hero.jpg` with a new hero background.
- Edit the title, tagline, and footer text in `index.html`.
- Adjust brand colors in `css/style.css` under the `:root` variables.

### Add Games

Open `admin.html` in the website and use the form to add or edit games. Uploaded covers are automatically resized to 300 x 400 and converted to WebP before being embedded in the exported JSON. Click **Download games.json**, then upload the downloaded file to the repository path:

```text
data/games.json
```

You can also edit `data/games.json` manually and add a new object:

```json
{
  "title": "Game Title",
  "genre": "Action",
  "size": 80,
  "graphics": "High",
  "controller": true,
  "image": "images/covers-webp/game-title.webp"
}
```

If you use the admin cover upload, you do not need to upload a separate cover file. If you manually use a file path such as `images/covers-webp/game-title.webp`, then add the matching optimized cover to `images/covers-webp/`.

### Change Categories

Open `js/app.js` and update the `categories` array. Make sure game genres in `games.json` match the category names.

### Add Or Update Compatible Devices

Use the **Device Compatibility Manager** in `admin.html` to add, edit, or remove brands and models. Changes are saved locally for preview. Click **Download devices.json**, then replace `data/devices.json` in the repository.

You can also edit `data/devices.json` manually. Devices are grouped by brand, and each model has a performance tier, CPU, and GPU:

```json
{
  "Brand Name": [
    {
      "id": "unique-model-id",
      "model": "Device Model",
      "tier": "Mid",
      "cpu": "Processor details",
      "gpu": "Graphics details"
    }
  ]
}
```

Use only `Low`, `Mid`, or `High` for the tier. A Mid device shows Low and Mid games; a High device shows all three tiers.

### Manage New Releases

Edit a game in `admin.html`, enable **Show In New Releases**, and choose its release or added date. Download the updated `games.json` and replace `data/games.json`. The customer website automatically displays up to six marked games, newest date first.

### Change Drive Sizes

Open `js/app.js` and update the `driveSizes` array.

### Update Drive Stock

Open `admin.html` through localhost or `127.0.0.1`, unlock the admin, and enter the available quantity for each drive. The admin intentionally refuses to unlock on a public GitHub Pages domain. A stock value of `0` disables that drive and displays **Sold out**.

For direct publishing, create a fine-grained GitHub personal access token with **Contents: Read and write** access to the website repository. Enter `username/repository`, the deployment branch, and the temporary token under **Publish Live Stock**, then click **Publish Stock**. The token is used only for that request and is never stored.

You can still click **Download drive-stock.json** and manually replace this repository file:

```text
data/drive-stock.json
```

Local stock edits apply immediately in the preview browser. Publishing or replacing the repository file makes the inventory available to every GitHub Pages visitor after the Pages deployment completes.

### Order References

Checkout generates a reference in the format `MGV-YYYYMMDD-HHMM-0000`. The same reference appears in the order review, Messenger order text, and exported PDF. Clearing the complete game selection starts a new order and generates a new reference.

## Notes

The How to Play guide uses the included Launcher as the primary game library. Keep the Launcher folder and game folders in their original locations so configured Play Actions and working directories remain valid.

All customer selections and game requests are stored locally in the visitor's browser. This keeps the site compatible with GitHub Pages and avoids the need for a server.
