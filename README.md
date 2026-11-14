# Parking Kothay

**Find. Book. Park.**

Parking Kothay is a frontend prototype for an AI-assisted smart parking platform for Dhaka City. It demonstrates separate experiences for drivers, parking owners, and administrators in one responsive website.

> **Demo project:** Listings, availability, bookings, payments, dashboards, and assistant replies use synthetic local data. There is no production backend or real payment processing.

## Run the prototype

1. Download or clone this repository.
2. Open `index.html` in a modern browser such as Google Chrome.
3. Internet access enables the external fonts, icons, map tiles, charts, and QR code library.

No build step or package installation is required.

## Demo sign-in

The first screen asks you to choose an account type:

- **Driver** — search for parking and manage reservations.
- **Parking Owner** — manage sample listings, availability, and check-ins.
- **Administrator** — review listing submissions and inspect sample analytics.

For this frontend demo, enter any valid email address and a nonempty password. This is not real account authentication.

## Features

- Responsive landing page, login screen, and role-specific dashboards.
- Parking search by neighborhood, vehicle, price, distance, rating, and verification status.
- Sample listings in Dhanmondi, Gulshan, Banani, Panthapath, Motijheel, Mirpur, Uttara, Mohammadpur, Badda, and Farmgate.
- Listing details, map links, and an interactive map when map tiles are available, with a visual fallback.
- Driver bookings with vehicle-based hourly rates (up to ৳50/hour for cars and ৳30/hour for motorcycles), price summaries, booking IDs, and QR passes.
- Owner tools for submitting listings with a Google Maps share link, managing availability, and validating demo bookings.
- Administrator tools for approving or rejecting sample listings and viewing synthetic analytics.
- SmartGuide searches local sample listings using neighborhood, vehicle, budget, and duration details. It can suggest spaces to view or book. Its replies are simulated and do not come from a live AI model.
- Browser `localStorage` persistence for demo bookings and owner-created listings, plus a **Reset demo** control.

## Technology

- HTML5, CSS3, and vanilla JavaScript in a single `index.html` file.
- CDN libraries: Leaflet, OpenStreetMap tiles, Chart.js, Lucide icons, QRCode.js, and Google Fonts.

## Project structure

```text
.
├── index.html
└── README.md
```

## Backend work for a production version

The prototype does not provide secure authentication, a database, live parking availability, real booking confirmation, payment processing, camera-based QR scanning, or a live AI service. These features need backend services and appropriate integrations before real users can rely on them.

## License

This is a university software engineering project prototype. Add a license file if you plan to distribute or reuse the project publicly.
