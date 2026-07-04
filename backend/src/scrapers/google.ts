import axios from 'axios';
import type { HotelResult, ActivityResult, RestaurantResult } from '../../../shared/types';

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

// ---------------------------------------------------------------------------
// Google Places API (New) — Text Search
//
// IMPORTANT scope note: Places API returns places (name, rating, location,
// address, photos) — it does NOT return live room rates, flight fares, or
// car rental pricing. There is no public Google API for flight/car search;
// those stay on the existing scraper stack. Hotels sourced from here will
// always have price_per_night: 0 (honest "no price data", same convention
// the rest of the pipeline already uses for missing prices) plus a rough
// price_level mapped from Google's PRICE_LEVEL_* enum where available.
// ---------------------------------------------------------------------------

interface PlacesPhoto {
  name?: string;
}

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: PlacesPhoto[];
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
}

interface PlacesSearchResponse {
  places?: PlacesPlace[];
}

function priceLevelToNumber(level?: string): number {
  switch (level) {
    case 'PRICE_LEVEL_FREE':
      return 0;
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return 2;
  }
}

function photoUrl(place: PlacesPlace): string {
  const photoName = place.photos?.[0]?.name;
  if (!photoName) return '';
  const key = process.env.GOOGLE_MAPS_API_KEY ?? '';
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=600&key=${key}`;
}

async function textSearch(query: string, fieldMask: string): Promise<PlacesPlace[]> {
  try {
    const res = await axios.post<PlacesSearchResponse>(
      PLACES_SEARCH_URL,
      { textQuery: query },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY ?? '',
          'X-Goog-FieldMask': fieldMask,
        },
        timeout: 15_000,
      }
    );
    return res.data.places ?? [];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[google] textSearch("${query}") failed:`, message);
    return [];
  }
}

const HOTEL_FIELD_MASK =
  'places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.location,places.photos,places.googleMapsUri';
const PLACE_FIELD_MASK =
  'places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.location,places.primaryType,places.primaryTypeDisplayName';

function normaliseHotel(place: PlacesPlace, index: number): HotelResult {
  return {
    id: `google-hotel-${place.id ?? index}`,
    name: place.displayName?.text ?? `Hotel ${index + 1}`,
    price_per_night: 0, // Places API does not expose room rates — see module note above.
    rating: place.rating ?? 0,
    review_count: place.userRatingCount ?? 0,
    amenities: [],
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    image_url: photoUrl(place),
    source: 'google',
    booking_url: place.googleMapsUri ?? '',
  };
}

function normaliseActivity(place: PlacesPlace, index: number): ActivityResult {
  return {
    id: `google-act-${place.id ?? index}`,
    name: place.displayName?.text ?? `Activity ${index + 1}`,
    category: place.primaryTypeDisplayName?.text ?? place.primaryType ?? 'Attraction',
    price: 0,
    rating: place.rating ?? 0,
    duration_hours: 2,
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    description: '',
    source: 'google',
  };
}

function normaliseRestaurant(place: PlacesPlace, index: number): RestaurantResult {
  return {
    id: `google-rest-${place.id ?? index}`,
    name: place.displayName?.text ?? `Restaurant ${index + 1}`,
    cuisine: place.primaryTypeDisplayName?.text ?? place.primaryType ?? 'Restaurant',
    price_level: priceLevelToNumber(place.priceLevel),
    rating: place.rating ?? 0,
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    source: 'google',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeGooglePlaces(
  destination: string
): Promise<{ hotels: HotelResult[]; activities: ActivityResult[]; restaurants: RestaurantResult[] }> {
  const [hotelPlaces, attractionPlaces, restaurantPlaces] = await Promise.all([
    textSearch(`hotels in ${destination}`, HOTEL_FIELD_MASK),
    textSearch(`tourist attractions in ${destination}`, PLACE_FIELD_MASK),
    textSearch(`restaurants in ${destination}`, PLACE_FIELD_MASK),
  ]);

  const hotels = hotelPlaces.slice(0, 20).map(normaliseHotel);
  const activities = attractionPlaces.slice(0, 20).map(normaliseActivity);
  const restaurants = restaurantPlaces.slice(0, 20).map(normaliseRestaurant);

  console.log(`[google] ${destination}: ${hotels.length} hotels, ${activities.length} activities, ${restaurants.length} restaurants`);

  return { hotels, activities, restaurants };
}
