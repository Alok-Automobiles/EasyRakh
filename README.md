# AlokAutomobiles Ledger

A modern **Khata (Ledger) Management System** built with the Next.js App Router. This application streamlines daily business operations with customer/supplier tracking, daily cash records, and a specialized **Voice Assistant** powered by Google Gemini for hands-free operation in English and Hindi.

---

##  Key Features

- **Ledger Management:** Maintain detailed debit/credit records for customers and suppliers.
- **Daily Cash Book:** Track daily cash flow (Rokad) with date-wise filtering.
- **Smart Dashboard:** Visual analytics for business health at a glance.
- **AI Voice Assistant:**
  - Powered by **Google Gemini** (`gemini-2.5-flash-lite` with fallback).
  - Supports natural language queries in **English and Hindi**.
  - Ask questions like _"What is today's total cash?"_ or _"Show me Rahul's ledger."_
- **Performance & Storage:**
  - **Redis** implementation for caching and API rate-limiting.
  - **Cloudinary** integration for secure document/media uploads.

---

## Tech Stack

- **Framework:** [Next.js 14+](https://nextjs.org/) (App Router)
- **Runtime:** Node.js 20+
- **Database:** MongoDB (Atlas or Local)
- **Caching:** Redis
- **AI Engine:** Google Gemini API
- **Storage:** Cloudinary
- **Package Manager:** pnpm

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+**
- **pnpm** (Run `corepack enable` to activate)
- **MongoDB Instance** (Local URL or MongoDB Atlas connection string)
- **Redis Instance** (Local or Cloud)
- **Google Gemini API Key** (Get it from [Google AI Studio](https://aistudio.google.com/app/apikey))

---

## Getting Started

### 1. Installation

Clone the repository and install dependencies using `pnpm`.

```bash
# Install dependencies
pnpm install