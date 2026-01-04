# MafitaPay 💳

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Django](https://img.shields.io/badge/django-5.2+-green.svg)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/react-19.1+-blue.svg)](https://reactjs.org/)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

**A comprehensive payment, cryptocurrency, and utilities platform for seamless financial transactions**

[Features](#-key-features) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Installation](#-installation)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Docker Deployment](#docker-deployment)
- [Configuration](#-configuration)
- [Usage](#-usage)
  - [API Endpoints](#api-endpoints)
  - [WebSocket Integration](#websocket-integration)
- [Security](#-security)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [Support & Contact](#-support--contact)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🚀 Overview

**MafitaPay** is a modern, full-stack financial platform that combines traditional payment processing with cryptocurrency capabilities. Built with Django REST Framework and React, it provides a secure, scalable solution for:

- 💰 **Wallet Management** - Multi-currency wallets with virtual account numbers
- 🔄 **P2P Trading** - Peer-to-peer deposit and withdrawal orders
- 💡 **Bill Payments** - Airtime, data, electricity, cable TV, and education payments
- 🪙 **Cryptocurrency** - Multi-chain crypto support (Ethereum, Solana, TON, NEAR, Binance Smart Chain)
- 📊 **Analytics** - Real-time dashboard for business insights
- 🔐 **Enterprise Security** - Advanced security features and compliance

MafitaPay is designed for merchants, end-users, and businesses looking for a unified platform to manage both fiat and cryptocurrency transactions.

---

## ✨ Key Features

### 💳 Wallet Management
- **Virtual Account Numbers (VAN)** - Auto-generated dedicated bank accounts for each user
- **Multi-provider Support** - Integration with Flutterwave, Paystack, PalmPay, Monnify, OPay
- **Card Deposits** - Support for EUR, USD, GBP card deposits with automatic NGN conversion
- **Real-time Balance Tracking** - Separate available and locked balances
- **Transaction History** - Complete audit trail of all wallet activities
- **Automated Crediting** - Webhook-based automatic wallet crediting

### 🤝 P2P Trading
- **Deposit Orders** - Users can buy from merchant offers
- **Withdrawal Orders** - Merchants can fulfill cash-out requests
- **Escrow System** - Funds locked during transactions for security
- **Real-time Updates** - WebSocket notifications for order status changes
- **Payment Proof Upload** - Image verification for transactions
- **Dispute Resolution** - Built-in dispute handling mechanism

### 💡 Bill & Utilities Payments
- **Airtime Recharge** - All major Nigerian networks (MTN, Glo, Airtel, 9mobile)
- **Data Bundles** - Mobile data plans for all networks
- **Electricity Bills** - AEDC, EKEDC, IBEDC, and other DISCOs
- **Cable TV Subscriptions** - DStv, GOtv, StarTimes
- **Education Payments** - WAEC, NECO, JAMB result checking PINs
- **VTpass Integration** - Reliable bill payment gateway

### 🪙 Cryptocurrency Support
- **Multi-chain Support**:
  - Ethereum (EVM) and ERC-20 tokens
  - Binance Smart Chain (BSC)
  - Solana and SPL tokens
  - TON (The Open Network)
  - NEAR Protocol
- **Gas Fee Management** - Real-time gas price estimation and optimization
- **Crypto Purchase** - Buy crypto with wallet balance
- **Price Tracking** - Live cryptocurrency price feeds via Binance API
- **Wallet Generation** - Secure crypto wallet creation for supported chains
- **Transaction Broadcasting** - Send crypto to any blockchain address

### 🔐 Security & Compliance
- **JWT Authentication** - Secure token-based authentication
- **Transaction PIN** - 4-digit PIN for sensitive operations
- **Biometric Auth** - Mobile app fingerprint/face ID support (Capacitor)
- **Webhook Verification** - HMAC-SHA256 signature validation
- **Rate Limiting** - DoS protection on critical endpoints
- **Payload Size Limits** - Request size validation (1MB max)
- **PII Protection** - Sanitized logging (no card numbers, PINs, passwords)
- **Audit Trail** - Comprehensive logging of all financial operations
- **Role-based Access Control** - Granular permissions (user, merchant, admin)
- **HTTPS Only** - Enforced secure connections in production

### 📊 Analytics & Reporting
- **CEO Dashboard** - Real-time business metrics
- **Transaction Analytics** - Daily trends, success rates, category breakdown
- **Revenue Analytics** - Revenue by source (deposits, P2P, crypto, bills)
- **User Analytics** - Active users, verification rates, registration trends
- **Service Analytics** - P2P performance, crypto purchases, bill payments
- **KPI Tracking** - Platform value, CLV, retention metrics
- **Export Capabilities** - CSV and JSON report exports
- **Database-backed Caching** - Optimized queries without Redis dependency

### ⚙️ System Features
- **Maintenance Mode** - Toggle system-wide maintenance with custom messages
- **Admin Panel** - Comprehensive Django admin interface
- **WebSocket Support** - Real-time notifications via Django Channels
- **Celery Tasks** - Background job processing for async operations
- **Email Notifications** - Transaction confirmations and alerts
- **Referral System** - User referral tracking and rewards
- **Bonus/Rewards** - Promotional bonus system
- **Docker Ready** - Containerization support for easy deployment
- **Mobile Support** - Progressive Web App (PWA) with Capacitor for iOS/Android

---

## 🛠 Tech Stack

### Backend
- **Framework**: Django 5.2.7 - High-level Python web framework
- **API**: Django REST Framework 3.16.1 - RESTful API development
- **Authentication**: djangorestframework-simplejwt 5.5.1 - JWT authentication
- **WebSocket**: Django Channels 4.3.1 - Real-time bidirectional communication
- **ASGI Server**: Daphne 4.2.1 - Async server for WebSockets
- **WSGI Server**: Gunicorn 23.0.0 - Production WSGI server
- **Task Queue**: Celery 5.5.3 - Distributed task processing
- **Message Broker**: AMQP 5.3.1 - Celery message transport

### Blockchain & Cryptocurrency
- **Ethereum/EVM**: web3 7.14.0, eth-account 0.13.7, eth-utils 5.3.1
- **Solana**: solana 0.36.9, solders 0.26.0
- **TON**: tonsdk 1.0.15
- **NEAR**: py-near 1.1.59
- **Binance**: python-binance 1.0.30
- **Cryptography**: pycryptodome 3.23.0, PyNaCl 1.6.0

### Payment Gateways & Services
- **Flutterwave** - Card deposits, virtual accounts, webhooks
- **Paystack** - paystack-sdk 1.0.1
- **VTpass** - Bill payments (airtime, data, electricity, cable TV)
- **PalmPay** - Alternative payment provider
- **Monnify** - Virtual account generation
- **OPay** - Payment processing

### Database & Storage
- **PostgreSQL**: psycopg[binary] 3.2.3 - Production database
- **SQLite** - Development database
- **Static Files**: WhiteNoise 6.7.0 - Static file serving

### Frontend
- **Framework**: React 19.1.1 - Modern UI library
- **Router**: react-router-dom 7.9.4 - Client-side routing
- **Build Tool**: Vite 7.1.7 - Fast build tooling
- **Styling**: Tailwind CSS 4.1.15 - Utility-first CSS
- **State Management**: @tanstack/react-query 5.90.16 - Server state management
- **HTTP Client**: axios 1.12.2 - API requests
- **UI Components**:
  - @headlessui/react 2.2.9 - Unstyled accessible components
  - @heroicons/react 2.2.0 - Beautiful icons
  - framer-motion 12.23.24 - Animation library
  - react-hot-toast 2.6.0 - Toast notifications
- **Charts**: recharts 3.3.0, react-apexcharts 1.8.0 - Data visualization
- **Mobile**: @capacitor/core 8.0.0 - Native mobile capabilities

### Additional Libraries & Utilities
- **CORS**: django-cors-headers 4.9.0 - Cross-origin resource sharing
- **Environment**: python-dotenv 1.1.1 - Environment variable management
- **HTTP**: httpx 0.28.1, aiohttp 3.13.1 - Async HTTP clients
- **JSON**: simplejson 3.20.2 - Enhanced JSON processing
- **Date/Time**: python-dateutil 2.9.0, pytz 2025.2
- **Forex**: forex-python 1.9.2 - Currency exchange rates
- **Validation**: validators 0.35.0 - Data validation
- **Logging**: loguru 0.7.3 - Advanced logging
- **Testing**: IPython 8.12.3 - Interactive debugging

---

## 📁 Project Structure

```
MafitaPay/
├── backend/                      # Django backend application
│   ├── mafitapay/               # Main Django project
│   │   ├── settings.py          # Django settings (DB, middleware, apps)
│   │   ├── urls.py              # Main URL routing
│   │   ├── asgi.py              # ASGI config (WebSockets)
│   │   └── wsgi.py              # WSGI config (HTTP)
│   │
│   ├── accounts/                # User authentication & management
│   │   ├── models.py            # Custom user model
│   │   ├── serializers.py       # User serializers
│   │   ├── views.py             # Auth endpoints (register, login)
│   │   └── views_pin.py         # Transaction PIN management
│   │
│   ├── wallet/                  # Wallet management
│   │   ├── models.py            # Wallet, Deposit, Transaction models
│   │   ├── views.py             # Wallet endpoints
│   │   ├── webhooks.py          # Payment gateway webhooks
│   │   └── services/            # Payment service integrations
│   │       ├── flutterwave_service.py
│   │       ├── paystack_service.py
│   │       └── palmpay_service.py
│   │
│   ├── p2p/                     # Peer-to-peer trading
│   │   ├── models.py            # Deposit/Withdrawal offers & orders
│   │   ├── views.py             # P2P endpoints
│   │   ├── consumers.py         # WebSocket consumers for real-time updates
│   │   └── routing.py           # WebSocket URL routing
│   │
│   ├── bills/                   # Bill & utility payments
│   │   ├── models.py            # Bill payment records
│   │   ├── views.py             # Bill payment endpoints
│   │   ├── vtu_ng.py            # VTpass integration
│   │   └── data_purchase.py     # Data bundle purchases
│   │
│   ├── gasfee/                  # Cryptocurrency & gas fees
│   │   ├── models.py            # Crypto transaction models
│   │   ├── views.py             # Crypto purchase endpoints
│   │   ├── evm_sender.py        # Ethereum/BSC transaction sender
│   │   ├── sol_utils.py         # Solana utilities
│   │   ├── ton_utils.py         # TON utilities
│   │   ├── near_utils.py        # NEAR utilities
│   │   └── price_services.py    # Crypto price feeds (Binance)
│   │
│   ├── analytics/               # Business analytics & reporting
│   │   ├── models.py            # Analytics cache models
│   │   ├── views.py             # Analytics endpoints
│   │   └── services.py          # Analytics computation logic
│   │
│   ├── core/                    # Core system features
│   │   ├── models.py            # AppSettings (maintenance mode)
│   │   ├── middleware.py        # Maintenance mode middleware
│   │   └── views.py             # System status endpoints
│   │
│   ├── referrals/               # Referral system
│   ├── rewards/                 # Bonus & rewards system
│   ├── gateways/                # Additional payment gateways
│   ├── static/                  # Static files (CSS, JS, images)
│   ├── templates/               # Django templates
│   ├── manage.py                # Django management script
│   └── requirements.txt         # Python dependencies
│
├── frontend/                    # React frontend application
│   ├── src/                     # Source code
│   │   ├── components/          # React components
│   │   ├── pages/               # Page components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── services/            # API service layer
│   │   ├── utils/               # Utility functions
│   │   └── App.jsx              # Main app component
│   │
│   ├── public/                  # Static assets
│   ├── capacitor.config.ts      # Mobile app configuration
│   ├── package.json             # Node.js dependencies
│   ├── vite.config.js           # Vite configuration
│   └── tailwind.config.js       # Tailwind CSS configuration
│
├── requirements.txt             # Root Python dependencies
├── runtime.txt                  # Python version for deployment
├── render.yaml                  # Render deployment config
├── LICENSE                      # MIT License
└── README.md                    # This file
```

### Key Module Descriptions

| Module | Purpose |
|--------|---------|
| **mafitapay** | Django project root with core settings and routing |
| **accounts** | User registration, authentication (JWT), profile, PIN management |
| **wallet** | Wallet CRUD, deposits (card/bank), withdrawals, transactions, webhooks |
| **p2p** | Merchant offers, buyer orders, escrow, WebSocket real-time updates |
| **bills** | Airtime, data, electricity, cable TV, education payment processing |
| **gasfee** | Multi-chain crypto purchases, gas estimation, wallet generation |
| **analytics** | CEO dashboard, transaction/revenue/user analytics, KPIs, exports |
| **core** | System-wide features (maintenance mode, app settings) |
| **referrals** | Referral tracking, reward distribution |
| **rewards** | Promotional bonuses, reward campaigns |
| **gateways** | Additional payment gateway integrations |

---

## 📥 Installation

### Prerequisites

- **Python 3.11+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **PostgreSQL 14+** (for production) - [Download PostgreSQL](https://www.postgresql.org/download/)
- **Git** - [Download Git](https://git-scm.com/downloads)

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Shehuna2/MafitaPay.git
   cd MafitaPay
   ```

2. **Create and activate virtual environment**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   # Create .env file in the root directory
   cp .env.example .env  # If example exists, otherwise create manually
   ```
   
   Edit `.env` with your configuration (see [Configuration](#-configuration) section).

5. **Run database migrations**
   ```bash
   cd backend
   python manage.py migrate
   ```

6. **Create superuser (admin)**
   ```bash
   python manage.py createsuperuser
   ```

7. **Collect static files** (for production)
   ```bash
   python manage.py collectstatic --noinput
   ```

8. **Run development server**
   ```bash
   # HTTP server
   python manage.py runserver

   # Or ASGI server (with WebSocket support)
   daphne -b 0.0.0.0 -p 8000 mafitapay.asgi:application
   ```

   Backend will be available at `http://localhost:8000`

9. **Run Celery worker** (optional, for background tasks)
   ```bash
   celery -A mafitapay worker -l info
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Create .env file in frontend directory
   cp .env.example .env
   ```
   
   Add backend API URL:
   ```env
   VITE_API_BASE_URL=http://localhost:8000/api
   VITE_WS_BASE_URL=ws://localhost:8000/ws
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

   Frontend will be available at `http://localhost:5173`

5. **Build for production**
   ```bash
   npm run build
   ```

   Production files will be in `frontend/dist/`

### Docker Deployment

Docker support is included for containerized deployment. While there's no Dockerfile in the root currently, you can create one:

1. **Create Dockerfile** (backend)
   ```dockerfile
   FROM python:3.11-slim
   
   WORKDIR /app
   
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   
   COPY backend/ .
   
   RUN python manage.py collectstatic --noinput
   
   EXPOSE 8000
   
   CMD ["gunicorn", "mafitapay.wsgi:application", "--bind", "0.0.0.0:8000"]
   ```

2. **Create docker-compose.yml**
   ```yaml
   version: '3.8'
   
   services:
     db:
       image: postgres:14
       environment:
         POSTGRES_DB: mafitapay
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgres
       volumes:
         - postgres_data:/var/lib/postgresql/data
     
     backend:
       build: .
       command: gunicorn mafitapay.wsgi:application --bind 0.0.0.0:8000
       volumes:
         - ./backend:/app
       ports:
         - "8000:8000"
       depends_on:
         - db
       env_file:
         - .env
     
     frontend:
       image: node:18
       working_dir: /app
       volumes:
         - ./frontend:/app
       ports:
         - "5173:5173"
       command: npm run dev
   
   volumes:
     postgres_data:
   ```

3. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

#### Django Core Settings
```env
# Django
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True  # Set to False in production
ALLOWED_HOSTS=localhost,127.0.0.1,yourdomain.com

# Database (PostgreSQL for production)
DATABASE_URL=postgresql://user:password@localhost:5432/mafitapay

# Deployment
RENDER=false  # Set to true if deploying on Render
```

#### Flutterwave (Card Deposits, Virtual Accounts)
```env
# Test/Sandbox
FLW_TEST_CLIENT_ID=your_test_client_id
FLW_TEST_CLIENT_SECRET=your_test_client_secret
FLW_TEST_ENCRYPTION_KEY=your_test_encryption_key
FLW_TEST_HASH_SECRET=your_test_hash_secret
FLW_TEST_BASE_URL=https://developersandbox-api.flutterwave.com

# Production
FLW_LIVE_CLIENT_ID=your_live_client_id
FLW_LIVE_CLIENT_SECRET=your_live_client_secret
FLW_LIVE_ENCRYPTION_KEY=your_live_encryption_key
FLW_LIVE_HASH_SECRET=your_live_hash_secret
FLW_LIVE_BASE_URL=https://f4bexperience.flutterwave.com
```

#### Paystack
```env
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
```

#### VTpass (Bill Payments)
```env
VTPASS_API_KEY=your_vtpass_api_key
VTPASS_PUBLIC_KEY=your_vtpass_public_key
VTPASS_SECRET_KEY=your_vtpass_secret_key
VTPASS_BASE_URL=https://api-service.vtpass.com/api
```

#### PalmPay
```env
PALMPAY_API_KEY=your_palmpay_api_key
PALMPAY_BASE_URL=https://api.palmpay.com
```

#### Cryptocurrency (optional, for private key storage)
```env
# Warning: Store private keys securely, preferably in a key management service
ETH_PRIVATE_KEY=your_ethereum_private_key
SOL_PRIVATE_KEY=your_solana_private_key
TON_SEED_PHRASE=your_ton_seed_phrase
NEAR_PRIVATE_KEY=your_near_private_key
```

#### Email Configuration
```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=MafitaPay <noreply@mafitapay.com>
```

#### Celery (Background Tasks)
```env
CELERY_BROKER_URL=amqp://guest:guest@localhost:5672//
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

#### Frontend (.env in frontend/ directory)
```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_BASE_URL=ws://localhost:8000/ws
```

---

## 📖 Usage

### API Endpoints

MafitaPay provides a comprehensive REST API. Below are the main endpoint categories:

#### Authentication
```http
POST   /api/accounts/register/           # User registration
POST   /api/accounts/login/              # User login (returns JWT)
POST   /api/accounts/token/refresh/      # Refresh JWT token
POST   /api/accounts/logout/             # User logout
GET    /api/accounts/profile/            # Get user profile
PATCH  /api/accounts/profile/            # Update user profile
POST   /api/accounts/set-pin/            # Set transaction PIN
POST   /api/accounts/verify-pin/         # Verify transaction PIN
```

#### Wallet Management
```http
GET    /api/wallet/                      # Get wallet balance
GET    /api/wallet/transactions/         # Transaction history
POST   /api/wallet/card-deposit/calculate-rate/  # Calculate exchange rate
POST   /api/wallet/card-deposit/charge/  # Initiate card deposit
GET    /api/wallet/card-deposit/rates/   # Get all exchange rates
POST   /api/wallet/flutterwave-webhook/  # Flutterwave webhook (internal)
POST   /api/wallet/palmpay-webhook/      # PalmPay webhook (internal)
GET    /api/wallet/deposits/             # Deposit history
```

#### P2P Trading
```http
# Deposit Orders (Buy)
GET    /api/p2p/deposit/offers/          # List available sell offers
POST   /api/p2p/deposit/offers/          # Create sell offer (merchant)
POST   /api/p2p/deposit/orders/          # Create buy order
GET    /api/p2p/deposit/orders/          # List your orders
PATCH  /api/p2p/deposit/orders/{id}/     # Update order status
POST   /api/p2p/deposit/orders/{id}/proof/  # Upload payment proof

# Withdrawal Orders (Sell)
GET    /api/p2p/withdraw/offers/         # List withdrawal offers
POST   /api/p2p/withdraw/offers/         # Create withdrawal offer
POST   /api/p2p/withdraw/orders/         # Create withdrawal order
GET    /api/p2p/withdraw/orders/         # List withdrawal orders
```

#### Bill Payments
```http
POST   /api/bills/airtime/               # Buy airtime
POST   /api/bills/data/                  # Buy data bundle
POST   /api/bills/electricity/           # Pay electricity bill
POST   /api/bills/cable/                 # Pay cable TV subscription
POST   /api/bills/education/             # Buy education PINs (WAEC, JAMB, etc.)
GET    /api/bills/history/               # Bill payment history
GET    /api/bills/providers/             # Get available service providers
```

#### Cryptocurrency
```http
GET    /api/gasfee/prices/               # Get crypto prices
POST   /api/gasfee/purchase/             # Purchase cryptocurrency
GET    /api/gasfee/balance/              # Check crypto balance
POST   /api/gasfee/estimate/             # Estimate gas fees
GET    /api/gasfee/transactions/         # Crypto transaction history
POST   /api/gasfee/send/                 # Send crypto to address
```

#### Analytics (Admin only)
```http
GET    /api/analytics/dashboard/overview/?days=30    # Dashboard overview
GET    /api/analytics/transactions/?days=30          # Transaction analytics
GET    /api/analytics/revenue/?days=30               # Revenue analytics
GET    /api/analytics/users/?days=30                 # User analytics
GET    /api/analytics/services/?days=30              # Service analytics
GET    /api/analytics/kpis/?days=30                  # Key performance indicators
GET    /api/analytics/reports/export/?type=transactions&format=json  # Export reports
```

#### System
```http
GET    /api/maintenance-status/          # Check maintenance mode status
```

#### Example: User Login
```bash
curl -X POST http://localhost:8000/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123"
  }'
```

Response:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "is_merchant": false
  }
}
```

#### Example: Get Wallet Balance
```bash
curl -X GET http://localhost:8000/api/wallet/ \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..."
```

Response:
```json
{
  "balance": "50000.00",
  "locked_balance": "5000.00",
  "available_balance": "45000.00",
  "van_account_number": "1234567890",
  "van_bank_name": "Wema Bank"
}
```

### WebSocket Integration

MafitaPay uses Django Channels for real-time features, primarily for P2P order updates.

#### Connect to WebSocket
```javascript
const token = "your-jwt-token";
const ws = new WebSocket(`ws://localhost:8000/ws/p2p/?token=${token}`);

ws.onopen = () => {
  console.log("Connected to P2P WebSocket");
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
  
  // Handle different message types
  if (data.type === "order_status_update") {
    console.log(`Order ${data.order_id} status: ${data.status}`);
  }
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = () => {
  console.log("WebSocket disconnected");
};
```

#### WebSocket Message Types

**Order Status Update**
```json
{
  "type": "order_status_update",
  "order_id": 123,
  "status": "paid",
  "message": "Buyer has marked order as paid",
  "timestamp": "2026-01-04T12:00:00Z"
}
```

**Payment Proof Uploaded**
```json
{
  "type": "payment_proof_uploaded",
  "order_id": 123,
  "proof_url": "/media/payment_proofs/proof_123.jpg"
}
```

---

## 🔐 Security

MafitaPay implements multiple layers of security to protect user funds and data:

### Security Features

✅ **Authentication & Authorization**
- JWT-based authentication with access and refresh tokens
- Role-based access control (User, Merchant, Admin)
- Transaction PIN for sensitive operations
- Biometric authentication support (mobile app)

✅ **Payment Security**
- Webhook signature verification (HMAC-SHA256)
- PCI-DSS compliant (no card data storage)
- 3D Secure support for card transactions
- Escrow system for P2P trades
- Idempotent transaction processing

✅ **API Security**
- Rate limiting on critical endpoints
- Request payload size limits (1MB max)
- CORS configuration
- HTTPS enforcement in production
- CSRF protection

✅ **Data Protection**
- PII sanitization in logs (no passwords, PINs, card numbers)
- Encrypted sensitive data storage
- Secure environment variable management
- Database connection encryption (SSL)

✅ **Operational Security**
- Comprehensive audit trails
- Critical error alerting (fund loss scenarios)
- Transaction monitoring
- Maintenance mode for emergency shutdowns

### Security Documentation

For detailed security information, see:
- [Flutterwave Security Audit](./FLUTTERWAVE_SECURITY_AUDIT.md) - Complete security audit report
- [Security Fixes Implementation](./SECURITY_FIXES_IMPLEMENTATION.md) - Implemented security measures
- [Card Deposit Security](./CARD_DEPOSIT_SECURITY.md) - Card payment security
- [Crypto Security Enhancement](./CRYPTO_SECURITY_ENHANCEMENT.md) - Cryptocurrency security
- [Transaction Security API](./TRANSACTION_SECURITY_API.md) - Transaction security measures
- [Webhook Fix README](./WEBHOOK_FIX_README.md) - Webhook security fixes

### Security Best Practices for Deployment

1. **Environment Variables**: Never commit `.env` files. Use secure secret management.
2. **HTTPS Only**: Always use HTTPS in production. Configure SSL certificates.
3. **Database**: Enable SSL for database connections. Use strong passwords.
4. **Webhooks**: Verify all webhook signatures. Log suspicious requests.
5. **API Keys**: Rotate API keys regularly. Use separate keys for test/production.
6. **Monitoring**: Set up alerts for failed authentications and suspicious activity.
7. **Backups**: Regular database backups with encryption.
8. **Updates**: Keep all dependencies updated. Monitor security advisories.

---

## 📚 Documentation

MafitaPay includes comprehensive documentation for all major features:

### Implementation Guides
- [Card Deposit Implementation](./CARD_DEPOSIT_IMPLEMENTATION.md) - Multi-currency card deposits
- [PalmPay Integration](./PALMPAY_INTEGRATION.md) - PalmPay payment gateway
- [Maintenance Mode](./MAINTENANCE_MODE_README.md) - System maintenance feature
- [Analytics Dashboard](./ANALYTICS_DASHBOARD.md) - Business analytics & KPIs
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Production deployment steps

### Security & Audit
- [Flutterwave Security Audit](./FLUTTERWAVE_SECURITY_AUDIT.md) - Security audit findings
- [Security Fixes Implementation](./SECURITY_FIXES_IMPLEMENTATION.md) - Security patches
- [Audit Executive Summary](./AUDIT_EXECUTIVE_SUMMARY.md) - Executive audit summary
- [Audit README](./AUDIT_README.md) - Audit documentation

### Implementation Summaries
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Overall implementation overview
- [Final Summary](./FINAL_SUMMARY.md) - Project completion summary
- [Solution Summary](./SOLUTION_SUMMARY.md) - Technical solutions implemented
- [CEO Analytics Implementation](./CEO_ANALYTICS_IMPLEMENTATION.md) - Analytics feature details
- [Maintenance Mode Implementation](./MAINTENANCE_MODE_IMPLEMENTATION_SUMMARY.md) - Maintenance mode details

### Frontend Documentation
- [Frontend README](./frontend/README.md) - Frontend setup and architecture
- [Capacitor Setup](./frontend/CAPACITOR_SETUP.md) - Mobile app configuration
- [Mobile Hooks Usage](./frontend/MOBILE_HOOKS_USAGE.md) - React hooks for mobile
- [Analytics README](./frontend/ANALYTICS_README.md) - Frontend analytics integration
- [Mobile Optimization Checklist](./frontend/MOBILE_OPTIMIZATION_CHECKLIST.md) - Mobile optimization

### Module-Specific
- [Analytics Module](./backend/analytics/README.md) - Analytics module documentation

---

## 🤝 Contributing

We welcome contributions to MafitaPay! Here's how you can help:

### Getting Started

1. **Fork the repository**
   ```bash
   # Click the "Fork" button on GitHub
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/MafitaPay.git
   cd MafitaPay
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make your changes**
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "Add: Your descriptive commit message"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your fork and branch
   - Describe your changes in detail

### Contribution Guidelines

- **Code Style**: Follow PEP 8 for Python, ESLint rules for JavaScript
- **Testing**: Write tests for new features and bug fixes
- **Documentation**: Update README and relevant docs for new features
- **Commits**: Use clear, descriptive commit messages
- **Issues**: Check existing issues before creating new ones
- **Pull Requests**: Keep PRs focused on a single feature/fix

### Areas for Contribution

- 🐛 **Bug Fixes**: Report and fix bugs
- ✨ **New Features**: Propose and implement new features
- 📝 **Documentation**: Improve documentation and examples
- 🎨 **UI/UX**: Enhance the user interface
- 🔒 **Security**: Identify and fix security vulnerabilities
- 🧪 **Testing**: Improve test coverage
- 🌍 **Localization**: Add translations

### Code of Conduct

Please be respectful and professional when contributing. We aim to maintain a welcoming and inclusive community.

---

## 💬 Support & Contact

### Get Help

- **Issues**: [GitHub Issues](https://github.com/Shehuna2/MafitaPay/issues) - Report bugs or request features
- **Discussions**: [GitHub Discussions](https://github.com/Shehuna2/MafitaPay/discussions) - Ask questions and share ideas
- **Documentation**: Check the [Documentation](#-documentation) section for detailed guides

### Contact

- **Author**: Shehuna2
- **Repository**: [https://github.com/Shehuna2/MafitaPay](https://github.com/Shehuna2/MafitaPay)
- **Website**: [https://mafitapay.pages.dev](https://mafitapay.pages.dev)

---

## 🗺 Roadmap

### In Progress
- ✅ Multi-currency card deposits (EUR, USD, GBP)
- ✅ CEO Analytics Dashboard
- ✅ Maintenance Mode
- ✅ Multi-chain cryptocurrency support

### Planned Features

**Q1 2026**
- 🔄 Bank transfer withdrawals
- 📱 Enhanced mobile app (iOS/Android)
- 🌐 Multi-language support
- 📊 Advanced reporting and exports

**Q2 2026**
- 🔗 More payment gateway integrations
- 🎯 Merchant dashboard improvements
- 🤖 Automated compliance checks
- 📈 Machine learning fraud detection

**Q3 2026**
- 💱 Fiat-to-crypto swaps
- 🏦 Stablecoin integration
- 🔐 Multi-signature wallet support
- 📱 White-label solution

**Q4 2026**
- 🌍 International expansion
- 🎁 Loyalty and rewards program
- 🤝 Partnership integrations
- 📊 Blockchain analytics

### Long-term Vision
- DeFi integration (lending, staking)
- NFT marketplace
- Cross-border payments
- Banking-as-a-Service (BaaS)

**Have a feature request?** [Open an issue](https://github.com/Shehuna2/MafitaPay/issues/new) or join the discussion!

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Shehuna2

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📊 Project Statistics

- **Languages**: Python, JavaScript, TypeScript
- **Framework**: Django 5.2, React 19
- **Total Modules**: 10+ backend apps, 1 frontend app
- **API Endpoints**: 50+ REST endpoints
- **Blockchain Networks**: 5+ (Ethereum, BSC, Solana, TON, NEAR)
- **Payment Gateways**: 5+ (Flutterwave, Paystack, PalmPay, VTpass, Monnify)

---

<div align="center">

**Built with ❤️ by [Shehuna2](https://github.com/Shehuna2)**

⭐ **Star this repo** if you find it useful!

[Report Bug](https://github.com/Shehuna2/MafitaPay/issues) • [Request Feature](https://github.com/Shehuna2/MafitaPay/issues) • [Contribute](https://github.com/Shehuna2/MafitaPay/pulls)

</div>
