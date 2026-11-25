# Celebrare 📸
### A Smart Event Photography Platform

Celebrare is a web-based event photography platform that helps guests browse event photos, select their favourite pictures, and access them through a photographer-specific payment workflow.

The platform connects photographers and guests through event galleries, dynamic pricing, payment request tracking, and demo payment validation.

**Project Status:** Under Development — Demo Payment Workflow

---

## 🚀 Project Overview

Celebrare aims to simplify the process of finding and accessing event photographs.

### Key Features

- Event-wise photo galleries
- Multiple photo selection
- Dynamic payment calculation
- Photographer-specific UPI details
- UPI payment link and QR generation (demo)
- Unique payment request IDs
- Five-minute payment request expiry
- Payment status tracking
- Demo bank transaction validation
- Duplicate transaction protection
- Payment-based photo access control

---

## 🛠️ Tech Stack

### Frontend
- React.js
- JavaScript
- HTML5
- CSS3
- Vite
- qrcode.react

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- REST APIs

### Security and Validation
- HMAC-SHA256 signature validation
- Unique transaction ID constraint
- Server-side payment expiry validation
- Photographer and amount matching
- Atomic payment status updates

---

## 📂 Project Structure

```text
celebrare/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── EventList.jsx
│   │   │   ├── GuestGallery.jsx
│   │   │   ├── ManagePhotos.jsx
│   │   │   ├── PaymentSection.jsx
│   │   │   └── PhotoCard.jsx
│   │   ├── App.jsx
│   │   └── App.css
│   └── package.json
│
├── server/
│   ├── models/
│   ├── routes/
│   │   ├── paymentRoutes.js
│   │   ├── photographerRoutes.js
│   │   ├── eventRoutes.js
│   │   ├── photoRoutes.js
│   │   └── bankEmailRoutes.js
│   ├── server.js
│   ├── package.json
│   └── .env
│
└── README.md
```

---

## 🔄 Application Workflow

### 1. Photographer and Event Management
- Photographers have unique IDs and UPI details.
- Events are associated with photographers.
- Event information is stored in MongoDB.

### 2. Guest Photo Selection
- Guests open an event gallery.
- Guests select multiple photographs.
- The total amount is calculated dynamically.

### 3. Payment Request Creation
The backend:
- Validates photographer and event details.
- Generates a unique payment request ID.
- Stores the selected photo IDs.
- Sets a five-minute expiry time.
- Generates a photographer-specific UPI payment link.

### 4. UPI QR Generation
The frontend generates a QR code using the UPI payment link.

**Note:** QR generation is part of the demo workflow. No real payment is collected.

### 5. Demo Payment Validation
The demo bank-email endpoint checks:
- Payment request ID
- Transaction ID
- Payment amount
- Recipient UPI ID
- Payment status
- Request expiry
- Duplicate transaction IDs

Only a request that passes the demo validation checks is marked as paid.

### 6. Photo Access
- Pending requests cannot unlock selected photos.
- Expired requests cannot unlock selected photos.
- Demo-paid requests can access their selected photos.

---

## 💳 Payment Status

| Status | Meaning |
|---|---|
| pending | Waiting for demo validation |
| paid | Accepted by the demo validation workflow |
| expired | Payment request has expired |

---

## 🔌 Backend API Endpoints

Base URL:

```text
http://localhost:5000/api
```

### Payment APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/payments/create` | Create a payment request |
| GET | `/payments/:paymentRequestId` | Check payment status |
| POST | `/payments/webhook/verify` | Validate a signed demo webhook |

### Bank Email Demo API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/bank-email/demo` | Validate fictional demo transaction data |

### Event APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/events/register` | Register an event |
| GET | `/events/photographer/:photographerId` | Get photographer's events |

### Photo APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/photos/add` | Add an event photo |
| GET | `/photos/event/:eventId` | Get event photos |
| GET | `/photos/unlocked/:paymentRequestId` | Get selected photos after demo payment |

---

## ⚙️ Installation and Setup

### Prerequisites

- Node.js
- npm
- MongoDB
- Git

### 1. Clone Repository

```bash
git clone https://github.com/tanutanu25-boop/celebrare.git
```

### 2. Open Project

```bash
cd celebrare
```

### 3. Setup Backend

```bash
cd server
npm install
```

Create a `.env` file inside the `server` directory:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
BANK_WEBHOOK_SECRET=your_private_random_secret
DEMO_MODE=true
```

Replace the placeholder values with your own local configuration. Never commit `.env` or share private secrets.

Start the backend:

```bash
node server.js
```

### 4. Setup Frontend

Open another terminal:

```bash
cd ~/celebrare/client
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

---

## 🧪 Demo Testing

The following scenarios have been tested using fictional demo transaction data:

| Test Case | Expected Result |
|---|---|
| Correct amount and UPI ID | Demo payment accepted |
| Incorrect amount | Request rejected |
| Incorrect recipient UPI ID | Request rejected |
| Duplicate transaction ID | HTTP 409 Conflict |
| Expired payment request | Payment rejected |
| Pending payment | Photos remain locked |
| Demo-paid payment | Selected photos become accessible |

All payment tests use demo data. No real UPI payment is performed.

---

## 🔐 Security Considerations and Limitations

Celebrare currently implements several validation mechanisms in its demo workflow:

- Unique payment request IDs
- Five-minute server-side expiry validation
- Photographer and amount matching
- HMAC-SHA256 signature validation
- Duplicate transaction ID protection
- Atomic payment status updates
- Payment-based photo access control

**Important:** The current bank-email route accepts fictional demo transaction data. HMAC authenticates a sender possessing the shared secret; it does not independently prove that a bank received money.

Cloudflare or email forwarding alone does not establish genuine bank payment confirmation.

Real bank or authenticated payment-provider integration, transaction reconciliation, access controls, and production security measures are still required before real payments can be supported.

---

## 📌 Development Status

### Implemented

- [x] React frontend
- [x] Event photo gallery
- [x] Multiple photo selection
- [x] Dynamic price calculation
- [x] UPI link and QR generation (demo)
- [x] Express backend
- [x] MongoDB integration
- [x] Photographer APIs
- [x] Event management APIs
- [x] Photo management APIs
- [x] Payment request creation
- [x] Five-minute payment expiry
- [x] Payment status tracking
- [x] HMAC demo webhook validation
- [x] Bank email demo validation route
- [x] Duplicate transaction protection
- [x] Payment-based photo unlocking
- [x] Responsive frontend UI

### Future Improvements

- [ ] Authenticated bank email processing
- [ ] Real bank/payment-provider integration
- [ ] Reliable transaction reconciliation
- [ ] Photographer authentication and authorization
- [ ] Production-ready payment verification
- [ ] Automated payment notifications
- [ ] Production deployment
- [ ] Improved monitoring and error handling

---

## 🎯 Project Goal

The goal of Celebrare is to simplify event photography access and payment management by connecting guests and photographers through a convenient digital platform.

---

## 👩‍💻 Development

**Project:** Celebrare  
**Repository:** https://github.com/tanutanu25-boop/celebrare

**Built with:** React.js, Node.js, Express.js, and MongoDB.

*This project is currently under development. Payment verification is simulated for demonstration purposes only.*