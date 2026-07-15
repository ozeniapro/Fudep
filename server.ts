import express from "express";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

// Lazy initialize Stripe
let stripe: Stripe | null = null;
function getStripeInstance() {
  if (!stripe) {
    const secretKey = process.env.fudep || process.env.FUDEP || process.env.STRIPE_SECRET_KEY || "sk_test_51ToPT3ArjPg92UKX5pWBEV7LtxS709xt1tVQtdlj9UQqKZqCRVj7LmlOHmiVImT4tTHjhMD2rH6m8kjQ2w9sfPFp00jomBpjdd";
    stripe = new Stripe(secretKey);
  }
  return stripe;
}

// Lazy initialize SMTP transporter
function getSMTPTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    const isSecure = port === "465" || parseInt(port) === 465;
    return nodemailer.createTransport({
      host: host,
      port: parseInt(port),
      secure: isSecure,
      auth: {
        user: user,
        pass: pass,
      },
      tls: {
        // Safe fallback for mail servers with self-signed or domain-mismatched SSL certs
        rejectUnauthorized: false
      }
    });
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Body parser middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const {
        technicianId,
        technicianName,
        serviceId,
        serviceName,
        price,
        clientFirstName,
        clientPhone,
        clientEmail,
        desiredDate,
        desiredTime,
        alternativeAvailabilities,
        message,
        origin,
      } = req.body;

      if (!technicianId || !serviceName || !price || !clientEmail || !desiredDate || !desiredTime) {
        return res.status(400).json({ error: "Champs requis manquants" });
      }

      const bookingId = `book_${Date.now()}`;
      const depositPrice = Math.round(price * 0.3 * 100) / 100; // 30%

      const stripeInstance = getStripeInstance();
      const session = await stripeInstance.checkout.sessions.create({
        payment_method_types: ["card"],
        locale: "fr",
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Acompte (30%) - ${serviceName}`,
                description: `Prestation chez ${technicianName} - ${desiredDate} à ${desiredTime}`,
              },
              unit_amount: Math.round(depositPrice * 100), // in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/?stripe_success=true&booking_id=${bookingId}&tech_id=${technicianId}&tech_name=${encodeURIComponent(technicianName)}&service_id=${serviceId}&service_name=${encodeURIComponent(serviceName)}&price=${price}&date=${encodeURIComponent(desiredDate)}&time=${encodeURIComponent(desiredTime)}&firstName=${encodeURIComponent(clientFirstName)}&phone=${encodeURIComponent(clientPhone)}&email=${encodeURIComponent(clientEmail)}&alt=${encodeURIComponent(alternativeAvailabilities)}&msg=${encodeURIComponent(message || "")}`,
        cancel_url: `${origin}/?stripe_cancel=true`,
      });

      res.json({ id: session.id, url: session.url });
    } catch (err: any) {
      console.error("Error creating stripe checkout session:", err);
      res.status(500).json({ error: err.message || "Erreur lors de la création de la session de paiement" });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    try {
      const { to, subject, text, html } = req.body;
      if (!to || !subject || (!text && !html)) {
        return res.status(400).json({ error: "Champs requis manquants: destinataire, sujet et contenu" });
      }

      const transporter = getSMTPTransporter();
      if (transporter) {
        const from = process.env.SMTP_FROM || `"Fudep" <contact@fudep.fr>`;
        await transporter.sendMail({
          from,
          to,
          subject,
          text: text || "",
          html: html || "",
        });
        console.log(`[REAL SMTP EMAIL SENT] To: ${to}, Subject: ${subject}`);
        res.json({ success: true, delivered: true });
      } else {
        console.log(`\n======================================================`);
        console.log(`[EMAIL SIMULATOR LOG] - SMTP not configured in .env`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content (Text): ${text || "N/A"}`);
        console.log(`======================================================\n`);
        res.json({ success: true, delivered: false, logged: true });
      }
    } catch (err: any) {
      console.error("Error sending email via API:", err);
      res.status(500).json({ error: err.message || "Erreur lors de l'envoi de l'e-mail" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(express.static(path.join(process.cwd(), "public")));
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Serve static assets with standard caching, but handle index.html carefully
    app.use(express.static(distPath, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else {
          // Keep other assets (JS, CSS, images with hashes) cached
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
