# Coupon Distribution App

A React application for distributing discount coupons to users.

## Local Development

1. Clone this repository
2. Install dependencies:
```bash
npm install
```
3. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
4. Update the `.env` file with your backend API URL
5. Start the development server:
```bash
npm start
```

## Deployment to Netlify

1. Push your code to GitHub
2. Log in to [Netlify](https://www.netlify.com/)
3. Click "New site from Git"
4. Choose your GitHub repository
5. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `build`
6. Add environment variable:
   - Key: `REACT_APP_API_URL`
   - Value: Your production backend URL
7. Click "Deploy site"

## Environment Variables

- `REACT_APP_API_URL`: URL of the backend API service 