# Parking Kothay

**Find. Book. Park.**

Parking Kothay is a Dhaka smart parking web app prototype. The browser interface is a single HTML file, and the Node.js API stores real registered users, parking listings, uploaded listing photos, and reservations in MongoDB.

## What is stored in MongoDB

- **Users:** name, email, phone, address, role, account status, and timestamps. Passwords are stored as bcrypt hashes, never as plain text.
- **Listings:** owner, property details, Google Maps link and coordinates, vehicle types, prices, capacity, availability, approval status, and timestamps.
- **Photos:** original image bytes are uploaded to a MongoDB GridFS bucket; listing documents keep references to those images. GridFS uses file and chunk collections for stored files. See [MongoDB GridFS documentation](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/).
- **Bookings:** driver, listing, vehicle, date, time, duration, rate, total, and status.

## Features

- Separate Driver, Parking Owner, and Administrator workspaces.
- Registration and role-based sign-in backed by MongoDB.
- Driver search, booking, booking history, cancellation, and QR pass.
- Owner listing creation, editing, deletion, availability changes, and photo upload.
- Google Maps share links on new listings.
- Admin listing approvals and user management, including account edits and suspension.
- SmartGuide recommendations based on the parking listings in the database. SmartGuide is a local simulated assistant, not a live AI model.
- Car and SUV rates are capped at ৳50/hour; motorcycle rates are ৳30/hour.
- MongoDB is the source of truth for user accounts, listings, listing photos, and bookings.

## Requirements

- Node.js 20 or later.
- A MongoDB database. MongoDB Atlas is an easy hosted option; a local MongoDB server also works.

## Configure MongoDB Atlas

1. Create an Atlas project and cluster, then create a database user.
2. Add the IP address of the computer that will run the app to the Atlas IP access list. Atlas only accepts connections from allowed IP addresses. See [Atlas connection setup](https://www.mongodb.com/docs/atlas/driver-connection/) and [IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
3. Copy the Node.js driver connection string from Atlas.

## Run locally

From the project folder in PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:

- `MONGODB_URI` to your Atlas connection string or local MongoDB URI.
- `MONGODB_DB_NAME` to `parking_kothay` (or another database name).
- `JWT_SECRET` to a new random secret of at least 32 characters.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the first administrator account. The seed script requires an admin password of at least 12 characters.

Then install dependencies, create the first administrator, and start the app:

```bash
npm install
npm run seed:admin
npm start
```

Open [http://localhost:3000](http://localhost:3000). Use this address instead of opening `index.html` directly so the frontend can reach the API.

Drivers and parking owners can register from the login page. Administrator accounts cannot be created from public registration; create the first one with `npm run seed:admin`. Later, an administrator can edit user roles in the Admin workspace.

## Update data

- Drivers and owners can update their account details in their workspace.
- Owners can create, edit, and delete listings. Listing photos are stored in GridFS and are removed when the listing is deleted.
- Admins can approve or reject listings and edit or suspend user accounts.
- Bookings are written to MongoDB. Capacity is reduced when a booking is accepted and restored when it is cancelled.
- API route summaries are available at [http://localhost:3000/api-docs](http://localhost:3000/api-docs) while the server is running.

## API overview

All API routes are served from `/api`. Protected routes require `Authorization: Bearer <token>`.

| Purpose | Routes |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| User profile | `PATCH /api/users/me` |
| Public listings | `GET /api/listings` |
| Owner listings and images | `GET /api/owner/listings`, `POST /api/owner/listings`, `PATCH` and `DELETE /api/owner/listings/:id`, image upload/removal routes |
| Bookings | `POST /api/bookings`, `GET /api/bookings/mine`, `GET /api/owner/bookings`, cancel and owner status routes |
| Admin | Listing approval routes and user list/edit/delete routes under `/api/admin` |
| Stored image | `GET /api/images/:id` |

## Project files

```text
.
├── index.html
├── server.js
├── seed-admin.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Push to GitHub and deployment

Commit `index.html`, `server.js`, `seed-admin.js`, `package.json`, `.env.example`, `.gitignore`, and `README.md`. **Do not commit `.env`**: it contains your MongoDB credentials and JWT secret, and is excluded by `.gitignore`.

GitHub stores the source code but does not run this Node.js API or MongoDB database by itself. To use the app outside your computer, deploy the Node server to a hosting service and configure `MONGODB_URI`, `MONGODB_DB_NAME`, and `JWT_SECRET` as private environment variables there. Serve the frontend from the same Node app so it can call the API on the same origin. A GitHub Pages deployment alone will only host the static HTML; it will not run this API or connect the app to MongoDB.

## Important limitations

This is a university project prototype, not a production service. SmartGuide is simulated; payment processing is not connected; QR check-in is manual; and login currently uses bearer tokens stored by the browser. Use a separate development database and strong credentials while testing.
