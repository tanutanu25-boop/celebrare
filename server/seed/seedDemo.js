import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import Photographer from "../models/Photographer.js";
import Event from "../models/Event.js";
import Photo from "../models/Photo.js";
import {
  ORIGINALS_DIR,
  buildDemoPhotoSvg,
  ensureStorageDirectories,
} from "../services/photoStorageService.js";

const DEMO_ACCOUNTS = [
  {
    photographerId: "aarav-photo",
    name: "Aarav Photography",
    email: "aarav@celebrare.demo",
    role: "photographer",
    upiId: "aarav.demo@upi",
    profileInfo: {
      studioName: "Aarav Photography Studio",
      bio: "Festive cultural events, Navratri & wedding candid photography across Gujarat.",
      city: "Ahmedabad",
      phone: "+91-98000-11101",
    },
    allowedBankSenders: [
      "alerts@hdfcbank.net",
      "upi@icicibank.com",
      "alerts@sbi.co.in",
    ],
    inboundEmailAlias: "payments+aarav@celebrare.example",
    isDemo: true,
  },
  {
    photographerId: "mountain-lens",
    name: "Mountain Lens Studio",
    email: "mountain@celebrare.demo",
    role: "photographer",
    upiId: "mountainlens.demo@upi",
    profileInfo: {
      studioName: "Mountain Lens Studio",
      bio: "Outdoor marathons, campus fests & Himalayan adventure portraits.",
      city: "Solan, Himachal Pradesh",
      phone: "+91-98000-22202",
    },
    allowedBankSenders: [
      "alerts@hdfcbank.net",
      "upi@icicibank.com",
      "alerts@axisbank.com",
    ],
    inboundEmailAlias: "payments+mountain@celebrare.example",
    isDemo: true,
  },
  {
    photographerId: "celebrare-admin",
    name: "Celebrare Trust & Safety Admin",
    email: "admin@celebrare.demo",
    role: "admin",
    upiId: "",
    profileInfo: {
      studioName: "Celebrare Operations",
      bio: "Payment verification & dispute review team.",
      city: "Bengaluru",
      phone: "",
    },
    isDemo: true,
  },
];

const DEMO_EVENTS = [
  {
    eventId: "navratri-night-2026",
    eventName: "Navratri Night 2026",
    photographerId: "aarav-photo",
    eventDate: new Date("2026-10-18T19:30:00Z"),
    description:
      "Vibrant dandiya & traditional portraits from Navratri Night 2026.",
    defaultPrice: 50,
    palettes: [
      ["#5b21b6", "#db2777", "#f59e0b"],
      ["#7c2d12", "#ea580c", "#fbbf24"],
      ["#312e81", "#7c3aed", "#ec4899"],
      ["#831843", "#be185d", "#f97316"],
    ],
    photoTitles: [
      "Dandiya Circle Spotlight",
      "Traditional Chaniya Choli Portrait",
      "Aarti Lamp Glow",
      "Stage Finale Celebration",
    ],
  },
  {
    eventId: "garba-festival-2026",
    eventName: "Garba Festival",
    photographerId: "aarav-photo",
    eventDate: new Date("2026-10-20T20:00:00Z"),
    description:
      "High-energy circular Garba dance frames and group highlights.",
    defaultPrice: 60,
    palettes: [
      ["#4c1d95", "#9333ea", "#f43f5e"],
      ["#9d174d", "#e11d48", "#fb923c"],
      ["#1e1b4b", "#4f46e5", "#f59e0b"],
    ],
    photoTitles: [
      "Garba Spin Motion",
      "Folk Drummers Live",
      "Midnight Ensemble",
    ],
  },
  {
    eventId: "solan-marathon-2026",
    eventName: "Solan Marathon 2026",
    photographerId: "mountain-lens",
    eventDate: new Date("2026-09-12T06:00:00Z"),
    description:
      "Morning ridge run finish-line portraits and mountain trail action shots.",
    defaultPrice: 40,
    palettes: [
      ["#0f766e", "#0284c7", "#38bdf8"],
      ["#14532d", "#16a34a", "#eab308"],
      ["#1e3a8a", "#2563eb", "#06b6d4"],
      ["#334155", "#0f766e", "#a3e635"],
    ],
    photoTitles: [
      "Sunrise Ridge Climb",
      "10K Finish Line Sprint",
      "Pine Trail Pacers",
      "Medal Podium Smile",
    ],
  },
  {
    eventId: "campus-celebration-2026",
    eventName: "Campus Celebration",
    photographerId: "mountain-lens",
    eventDate: new Date("2026-11-05T17:00:00Z"),
    description:
      "Annual convocation, cultural night, and alumni reunion moments.",
    defaultPrice: 45,
    palettes: [
      ["#1d4ed8", "#7c3aed", "#14b8a6"],
      ["#0369a1", "#0ea5e9", "#f59e0b"],
      ["#065f46", "#10b981", "#3b82f6"],
    ],
    photoTitles: [
      "Convocation Cap Toss",
      "Acoustic Quad Night",
      "Batch Reunion Group",
    ],
  },
];

export async function seedDemoData() {
  await ensureStorageDirectories();
  const demoPasswordHash = await bcrypt.hash("DemoPass123!", 10);

  for (const account of DEMO_ACCOUNTS) {
    await Photographer.findOneAndUpdate(
      { photographerId: account.photographerId },
      {
        $setOnInsert: {
          ...account,
          passwordHash: demoPasswordHash,
        },
      },
      { upsert: true, new: true }
    );
  }

  for (const ev of DEMO_EVENTS) {
    const photographer = DEMO_ACCOUNTS.find(
      (a) => a.photographerId === ev.photographerId
    );
    await Event.findOneAndUpdate(
      { eventId: ev.eventId },
      {
        $setOnInsert: {
          eventId: ev.eventId,
          eventName: ev.eventName,
          photographerId: ev.photographerId,
          eventDate: ev.eventDate,
          description: ev.description,
          status: "active",
          defaultPrice: ev.defaultPrice,
          currency: "INR",
          isDemo: true,
        },
      },
      { upsert: true, new: true }
    );

    for (let i = 0; i < ev.photoTitles.length; i++) {
      const photoId = i + 1;
      const filename = `${ev.eventId}-photo-${photoId}.svg`;
      const filePath = path.join(ORIGINALS_DIR, filename);

      const existsOnDisk = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      if (!existsOnDisk) {
        const svgContent = buildDemoPhotoSvg({
          title: ev.photoTitles[i],
          eventName: ev.eventName,
          photographerName: photographer.name,
          palette: ev.palettes[i % ev.palettes.length],
          photoNumber: photoId,
          watermarked: false,
        });
        await fs.writeFile(filePath, svgContent, "utf8");
      }

      await Photo.findOneAndUpdate(
        { eventId: ev.eventId, photoId },
        {
          $setOnInsert: {
            photoId,
            photographerId: ev.photographerId,
            eventId: ev.eventId,
            title: ev.photoTitles[i],
            storageKey: filename,
            thumbnailPath: `/api/photos/preview/${ev.eventId}/${photoId}`,
            price: ev.defaultPrice + i * 10,
            metadata: {
              originalName: filename,
              mimeType: "image/svg+xml",
              sizeBytes: 2048,
              width: 1200,
              height: 800,
            },
            isActive: true,
          },
        },
        { upsert: true, new: true }
      );
    }
  }
}

export const DEMO_CREDENTIALS_SUMMARY = {
  photographerA: {
    photographerId: "aarav-photo",
    name: "Aarav Photography",
    email: "aarav@celebrare.demo",
    upiId: "aarav.demo@upi",
    events: ["Navratri Night 2026", "Garba Festival"],
  },
  photographerB: {
    photographerId: "mountain-lens",
    name: "Mountain Lens Studio",
    email: "mountain@celebrare.demo",
    upiId: "mountainlens.demo@upi",
    events: ["Solan Marathon 2026", "Campus Celebration"],
  },
  admin: {
    photographerId: "celebrare-admin",
    name: "Celebrare Trust & Safety Admin",
    email: "admin@celebrare.demo",
  },
};
