import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LocationMapDisplayProps {
  address: string | null;
  heightClass?: string;
  hideHeader?: boolean;
}

export function LocationMapDisplay({ address, heightClass = "h-64", hideHeader = false }: LocationMapDisplayProps) {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setCoords(null);
      return;
    }

    let isMounted = true;
    const fetchCoords = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
        const data = await res.json();
        if (isMounted && data && data.length > 0) {
          setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        } else {
          setCoords(null);
        }
      } catch (error) {
        console.error("Greška pri preuzimanju lokacije:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCoords();

    return () => {
      isMounted = false;
    };
  }, [address]);

  if (!address) return null;

  return (
    <div className={`glass-card rounded-2xl p-5 border-slate-200 dark:border-slate-800 shadow-sm mt-6 ${hideHeader ? 'mt-0 p-3' : ''}`}>
      {!hideHeader && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Lokacija događaja</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{address}</p>
        </>
      )}

      {loading ? (
        <div className={`${heightClass} w-full rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center`}>
          <span className="text-slate-400 text-sm">Učitavanje mape...</span>
        </div>
      ) : coords ? (
        <div className={`${heightClass} w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner z-0`}>
          <MapContainer center={coords} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%", zIndex: 1 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={coords} />
          </MapContainer>
        </div>
      ) : (
        <div className={`${heightClass} w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-500`}>
          <MapPin className="h-8 w-8 mb-2 opacity-20 shrink-0" />
          <span className="text-sm text-center px-4 line-clamp-2">Mapa nije dostupna za lokaciju:<br/>{address}</span>
        </div>
      )}
    </div>
  );
}
