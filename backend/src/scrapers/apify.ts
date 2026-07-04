import axios from 'axios';
import type { HotelResult } from '../../../shared/types';

const ACTOR_URL =
  'https://api.apify.com/v2/acts/voyager~booking-scraper/run-sync-get-dataset-items';
// The orchestrator waits for ALL scrapers, so this timeout is the floor on
// every uncached search's latency. The 45s budget this used to have gated
// each search at ~45-90s while the actor cold-start never actually finished
// in time anyway (0 successes all session). 8s keeps the integration alive
// for the rare warm-actor win without holding the whole search hostage;
// booking-com15 (rapidapi/booking.ts) is the reliable Booking.com source.
const TIMEOUT_MS = 8_000;

interface BookingItem {
  name?: string;
  hotel_name?: string;
  price?: number;
  pricePerNight?: number;
  starRating?: number;
  stars?: number;
  reviewScore?: number;
  reviewAverage?: number;
  reviewsCount?: number;
  numberOfReviews?: number;
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number };
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  url?: string;
  hotelUrl?: string;
  image?: string;
  imageUrl?: string;
  photos?: string[];
  amenities?: string[];
  facilities?: string[];
}

function normaliseHotel(item: BookingItem, index: number): HotelResult {
  const lat =
    item.location?.lat ?? item.location?.latitude ?? item.lat ?? item.latitude ?? 0;
  const lng =
    item.location?.lng ?? item.location?.longitude ?? item.lng ?? item.longitude ?? 0;

  // reviewScore/reviewAverage are Booking's 0-10 scale; starRating/stars are 0-5.
  // Everything downstream (star display, dedupe "prefer higher rating", rating
  // filters) assumes 0-5, so halve anything that's clearly on the 10-point scale.
  const rawRating =
    item.reviewScore ?? item.reviewAverage ?? item.starRating ?? item.stars ?? 0;
  const rating = Number(rawRating) > 5 ? Math.round(Number(rawRating) * 5) / 10 : Number(rawRating);

  const image =
    item.image ?? item.imageUrl ?? (Array.isArray(item.photos) ? item.photos[0] : '') ?? '';

  const amenities: string[] = item.amenities ?? item.facilities ?? [];

  return {
    id: `booking-${index}-${(item.name ?? item.hotel_name ?? '').toLowerCase().replace(/\W+/g, '-').substring(0, 30)}`,
    name: item.name ?? item.hotel_name ?? `Hotel ${index + 1}`,
    price_per_night: item.price ?? item.pricePerNight ?? 0,
    rating: Math.min(rating, 5),
    review_count: item.reviewsCount ?? item.numberOfReviews ?? 0,
    amenities: amenities.slice(0, 10),
    lat: Number(lat),
    lng: Number(lng),
    image_url: String(image),
    source: 'booking.com',
    booking_url: item.url ?? item.hotelUrl ?? '',
  };
}

export async function scrapeBooking(
  destination: string,
  checkin: string,
  checkout: string
): Promise<HotelResult[]> {
  try {
    const token = process.env.APIFY_API_KEY;
    const res = await axios.post<BookingItem[]>(
      `${ACTOR_URL}?token=${token}`,
      {
        search: destination,
        checkIn: checkin,
        checkOut: checkout,
        maxResults: 20,
      },
      {
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const items: BookingItem[] = Array.isArray(res.data) ? res.data : [];
    const hotels = items.slice(0, 20).map(normaliseHotel);
    console.log(`[apify/booking] ${destination}: ${hotels.length} hotels`);
    return hotels;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Timeout is a common / expected failure — log and return gracefully
    if (msg.includes('timeout') || msg.includes('ECONNABORTED')) {
      console.warn(`[apify/booking] timed out for "${destination}" — returning []`);
    } else {
      console.error(`[apify/booking] error for "${destination}":`, msg);
    }
    return [];
  }
}
