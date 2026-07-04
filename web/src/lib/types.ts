export interface Photo {
  id: string;
  nodeUid: string;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
  approx: boolean; // location inferred from timestamp neighbours
  ar?: number; // aspect ratio (w/h), captured for potential gallery use
  isVideo?: boolean;
  isHeic?: boolean; // HEIC/HEIF — not natively renderable; decode in the lightbox
  motionUid?: string; // Live Photo: the related motion-video node to play
}

// A "stop": consecutive photos clustered by location (a place on the journey).
export interface Stop {
  key: string; // stable id (first photo's nodeUid) — used for description keying
  title?: string; // user-edited title, overrides `place`
  place?: string | null; // reverse-geocoded (cached)
  lat: number | null; // centroid
  lng: number | null;
  startTime: string | null;
  endTime: string | null;
  description?: string; // user-authored note for this stop
  photos: Photo[];
}

export interface Manifest {
  title: string;
  albumUid: string;
  coverNodeUid?: string | null;
  bounds: [[number, number], [number, number]] | null;
  route: [number, number][]; // stop centroids, in order
  stops: Stop[];
}

// The single JSON file per album, stored in Proton /trips-index/<slug>.json.
// Doubles as the cache for expensive EXIF/geocode work.
export interface StoredAlbum extends Manifest {
  version: number;
  lastActivityTime: number | null; // rebuild when this changes
  savedAt: string;
}

export interface AlbumIndexEntry {
  slug: string;
  title: string;
  albumUid: string;
  coverNodeUid?: string | null;
  dateRange?: string;
}

export interface AlbumIndex {
  albums: AlbumIndexEntry[];
}
