import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface Place {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export function LocationInput({ value, onChange, placeholder = "Unesite lokaciju..." }: LocationInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (value !== query && !open) {
      setQuery(value);
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search function with debounce
  useEffect(() => {
    if (!query || query.length < 3 || !open) {
      setResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const data = await res.json();
        setResults(data);
      } catch (error) {
        console.error("Error fetching locations:", error);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, open]);

  const handleSelect = (place: Place) => {
    const coords: [number, number] = [parseFloat(place.lat), parseFloat(place.lon)];
    setSelectedCoords(coords);
    setQuery(place.display_name);
    onChange(place.display_name);
    setOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    setOpen(true);
    if (!e.target.value) {
      setSelectedCoords(null);
    }
  };

  return (
    <div className="space-y-3" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" /> : <Search className="h-4 w-4 text-muted-foreground" />}
        </div>
        <Input
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
          autoComplete="off"
        />
        
        {/* Dropdown Results */}
        {open && results.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-md max-h-60 overflow-auto">
            {results.map((place) => (
              <button
                key={place.place_id}
                type="button"
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-start gap-2"
                onClick={() => handleSelect(place)}
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span>{place.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Preview */}
      {selectedCoords && (
        <div className="h-48 w-full rounded-md overflow-hidden border">
          <MapContainer center={selectedCoords} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={selectedCoords} />
          </MapContainer>
        </div>
      )}
    </div>
  );
}
