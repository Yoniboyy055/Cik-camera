import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Map3DProps {
  latitude: number;
  longitude: number;
  className?: string;
}

export default function Map3D({ latitude, longitude, className = "w-full h-full" }: Map3DProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const marker = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = (import.meta as any).env.VITE_MAPBOX_TOKEN;
    if (!token) {
      console.warn('VITE_MAPBOX_TOKEN is missing. Map will not render.');
      return;
    }

    mapboxgl.accessToken = token;

    if (map.current) {
      map.current.flyTo({ center: [longitude, latitude], zoom: 16 });
      if (marker.current) {
        marker.current.setLngLat([longitude, latitude]);
      } else {
        marker.current = new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat([longitude, latitude])
          .addTo(map.current);
      }
      return;
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [longitude, latitude],
      zoom: 16,
      pitch: 60, // 3D pitch
      bearing: -20,
      antialias: true
    });

    map.current.on('style.load', () => {
      // Add 3D buildings layer
      const layers = map.current?.getStyle()?.layers;
      let labelLayerId;
      if (layers) {
        for (let i = 0; i < layers.length; i++) {
          if (layers[i].type === 'symbol' && layers[i].layout?.['text-field']) {
            labelLayerId = layers[i].id;
            break;
          }
        }
      }

      map.current?.addLayer(
        {
          'id': 'add-3d-buildings',
          'source': 'composite',
          'source-layer': 'building',
          'filter': ['==', 'extrude', 'true'],
          'type': 'fill-extrusion',
          'minzoom': 15,
          'paint': {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.6
          }
        },
        labelLayerId
      );

      // Add a marker
      marker.current = new mapboxgl.Marker({ color: '#10b981' }) // Using the hex value for emerald-500/brand-primary
        .setLngLat([longitude, latitude])
        .addTo(map.current!);
    });

    return () => {
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [latitude, longitude]);

  if (!(import.meta as any).env.VITE_MAPBOX_TOKEN) {
    return (
      <div className={`bg-brand-bg flex flex-col items-center justify-center text-brand-text-muted p-4 text-center ${className}`}>
        <p className="text-sm font-medium mb-1">3D Map Unavailable</p>
        <p className="text-xs">Please add VITE_MAPBOX_TOKEN to your environment variables.</p>
      </div>
    );
  }

  return <div ref={mapContainer} className={className} />;
}
