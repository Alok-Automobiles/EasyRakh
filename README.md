# Easy Rakh

A modern **Khata (Ledger) Management System** built with Next.js. Track customers, suppliers, daily cash records, inventory/stock, invoices, and use an AI Voice Assistant powered by Google Gemini.

---

## Features

- **Ledger Management** - Track debit/credit for customers and suppliers
- **Daily Cash Book** - Monitor daily cash flow
- **Inventory & Stock Tracking** - Manage parts and products with quantities, locations, images, and PDF export
- **Smart Dashboard** - Business analytics at a glance
- **AI Voice Assistant** - Ask questions in English or Hindi
- **Redis Caching** - Fast performance with rate limiting
- **Cloudinary** - Secure file uploads

---

## Quick Start

### 1. Install Dependencies

```bash
corepack enable
pnpm install
```

### 2. Setup Environment Variables

Create `.env.local` in the root directory:

```bash
MONGODB_URI=mongodb://localhost:27017/ledger
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=your-secret-key-here
GEMINI_API_KEY=your-gemini-api-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=port number
SMTP_USER=your email address
SMTP_PASS=your email password
SMTP_FROM=your email address
```

### 3. Start Services

Make sure MongoDB and Redis are running locally, or use cloud services (MongoDB Atlas, Redis Cloud).

### 4. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Requirements

- Node.js 20+
- MongoDB (local or Atlas)
- Redis (local or cloud)
- Google Gemini API Key ([Get it here](https://aistudio.google.com/app/apikey))
- Cloudinary Account ([Sign up here](https://cloudinary.com))

---

## Available Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run linter

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## Reporting Issues

If you find any issues or vulnerabilities, please raise an issue ticket in the repository. Your feedback helps make this project better for everyone.

---

> "Alone we can do so little; together we can do so much." - Helen Keller
>
> We believe in growing as a community. Every contribution, no matter how small, helps us build something great together.
