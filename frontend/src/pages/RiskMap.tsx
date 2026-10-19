import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import { api } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { EmptyState } from '../components/EmptyState';
import {
  RiskLevel,
  ZoneFeatureProperties,
} from '../types';

type HazardMode = 'heat' | 'rain' | 'combined';
type SeverityFilter = 'all' | RiskLevel;
type FacilityType = 'hospital' | 'school' | 'shelter' | 'power_substation' | 'drainage_culvert';
type DrawerTab = 'hazard' | 'exposure' | 'vulnerability' | 'evidence';

interface HoveredZoneInfo {
  properties: ZoneFeatureProperties;
  x: number;
  y: number;
}

const KARACHI_CENTER: [number, number] = [67.08, 24.89];
const INITIAL_ZOOM = 10.3;

interface RiskMapProps {
  isSample?: boolean;
}

export const RiskMap: React.FC<RiskMapProps> = () => {
  const shouldReduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedZoneId = searchParams.get('zone') || searchParams.get('zone_id') || null;

  // Filter States
  const [hazardMode, setHazardMode] = useState<HazardMode>('combined');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [enabledFacilityTypes, setEnabledFacilityTypes] = useState<Record<FacilityType, boolean>>({
    hospital: true,
    school: true,
    shelter: true,
    power_substation: true,
    drainage_culvert: true,
  });

  // Drawer & UI States
  const [activeTab, setActiveTab] = useState<DrawerTab>('hazard');
  const [hoveredZone, setHoveredZone] = useState<HoveredZoneInfo | null>(null);
  const [tilesOffline, setTilesOffline] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Map DOM and Instance References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);

  // 1. Fetch Zones GeoJSON FeatureCollection
  const {
    data: zonesResponse,
    isLoading: isZonesLoading,
    isError: isZonesError,
    refetch: refetchZones,
  } = useQuery({
    queryKey: ['map-zones', hazardMode],
    queryFn: () => api.getMapZones(hazardMode),
    refetchInterval: 60000,
  });

  // Active facility types array for API query
  const activeFacilityTypesParam = useMemo(() => {
    return Object.entries(enabledFacilityTypes)
      .filter(([_, enabled]) => enabled)
      .map(([type]) => type);
  }, [enabledFacilityTypes]);

  // 2. Fetch Facilities GeoJSON Points
  const {
    data: facilitiesResponse,
  } = useQuery({
    queryKey: ['map-facilities', activeFacilityTypesParam.join(',')],
    queryFn: () => api.getMapFacilities(activeFacilityTypesParam),
    refetchInterval: 60000,
  });

  // 3. Fetch Selected Zone Detail Dossier
  const {
    data: zoneDetailResponse,
    isLoading: isZoneDetailLoading,
    isError: isZoneDetailError,
    refetch: refetchZoneDetail,
  } = useQuery({
    queryKey: ['map-zone-detail', selectedZoneId],
    queryFn: () => api.getZoneDetail(selectedZoneId!),
    enabled: Boolean(selectedZoneId),
    refetchInterval: 60000,
  });

  const zonesGeoJSON = zonesResponse?.data;

  // Filtered Zones based on Severity Filter
  const filteredZonesGeoJSON = useMemo(() => {
    if (!zonesGeoJSON) return null;
    if (severityFilter === 'all') return zonesGeoJSON;
    return {
      ...zonesGeoJSON,
      features: zonesGeoJSON.features.filter(
        (f) => f.properties.risk_level === severityFilter
      ),
    };
  }, [zonesGeoJSON, severityFilter]);

  // URL Query Sync for Selected Zone
  const handleSelectZone = (zoneId: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (zoneId) {
      nextParams.set('zone', zoneId);
    } else {
      nextParams.delete('zone');
      nextParams.delete('zone_id');
    }
    setSearchParams(nextParams);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadGeoJSON = () => {
    if (!zonesGeoJSON) return;
    const blob = new Blob([JSON.stringify(zonesGeoJSON, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `climateshield-karachi-${hazardMode}-zones.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Resilient MapLibre Style Specification
    // Free tile source (OpenStreetMap raster tiles) with graceful blank dark nautical background fallback (#0A1A2F)
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#0A1A2F', // Nautical dark GIS canvas fallback
            },
          },
          {
            id: 'osm-raster-tiles',
            type: 'raster',
            source: 'osm-raster',
            minzoom: 0,
            maxzoom: 19,
            paint: {
              'raster-opacity': 0.65,
            },
          },
        ],
      },
      center: KARACHI_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 8.5,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.on('error', (e) => {
      // Graceful offline/tile degradation: falls back to dark nautical blank background (#0A1A2F)
      if (e.error && String(e.error).toLowerCase().includes('tile')) {
        setTilesOffline(true);
      }
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      // 1. Add Zones GeoJSON Source
      map.addSource('zones-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // 2. Zone Choropleth Fill Layer
      // Rule 4: Low green, Moderate yellow, High orange, Severe red
      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones-source',
        paint: {
          'fill-color': [
            'match',
            ['get', 'risk_level'],
            'Severe',
            '#DC2626',
            'High',
            '#EA580C',
            'Moderate',
            '#F59E0B',
            'Low',
            '#10B981',
            '#64748B',
          ],
          'fill-opacity': 0.6,
        },
      });

      // 3. Zone Boundaries Layer
      map.addLayer({
        id: 'zones-borders',
        type: 'line',
        source: 'zones-source',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 1.8,
          'line-opacity': 0.75,
        },
      });

      // 4. Zone Selection Highlight Layer
      map.addLayer({
        id: 'zones-selected',
        type: 'line',
        source: 'zones-source',
        paint: {
          'line-color': '#38BDF8',
          'line-width': 3.5,
          'line-opacity': 0.95,
        },
        filter: ['==', ['get', 'zone_id'], ''],
      });

      // 5. Add Facilities GeoJSON Source & Points Layer
      map.addSource('facilities-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'facilities-points',
        type: 'circle',
        source: 'facilities-source',
        paint: {
          'circle-radius': 6.5,
          'circle-color': [
            'match',
            ['get', 'type'],
            'hospital',
            '#EF4444',
            'school',
            '#3B82F6',
            'shelter',
            '#10B981',
            'power_substation',
            '#F59E0B',
            'drainage_culvert',
            '#06B6D4',
            '#94A3B8',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.9,
        },
      });

      // --- Interactive Events ---

      // Zone hover tooltip
      map.on('mousemove', 'zones-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';
        const feat = e.features[0];
        const props = feat.properties as unknown as ZoneFeatureProperties;

        // Parse interval if stored as stringified JSON in GeoJSON properties
        let intervalArr: [number, number] = [props.interval_low, props.interval_high];
        if (typeof props.interval === 'string') {
          try {
            intervalArr = JSON.parse(props.interval);
          } catch {
            intervalArr = [props.interval_low, props.interval_high];
          }
        }

        setHoveredZone({
          properties: {
            ...props,
            interval: intervalArr,
          },
          x: e.point.x,
          y: e.point.y,
        });
      });

      map.on('mouseleave', 'zones-fill', () => {
        map.getCanvas().style.cursor = '';
        setHoveredZone(null);
      });

      // Zone click to open detail drawer
      map.on('click', 'zones-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const zid = e.features[0].properties?.zone_id;
          if (zid) {
            handleSelectZone(zid);
          }
        }
      });

      // Facility click
      map.on('click', 'facilities-points', (e) => {
        if (e.features && e.features.length > 0) {
          const fprops = e.features[0].properties;
          const zid = fprops?.zone_id;
          if (zid) {
            handleSelectZone(zid);
          }
        }
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  // Update Zones Data when zones query or severity filter changes
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !filteredZonesGeoJSON) return;
    const source = mapRef.current.getSource('zones-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(filteredZonesGeoJSON as any);
    }
  }, [filteredZonesGeoJSON]);

  // Update Facilities Data when facilities query changes
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !facilitiesResponse?.data) return;
    const source = mapRef.current.getSource('facilities-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(facilitiesResponse.data as any);
    }
  }, [facilitiesResponse]);

  // Update Selected Zone Highlight
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    try {
      if (selectedZoneId) {
        mapRef.current.setFilter('zones-selected', ['==', ['get', 'zone_id'], selectedZoneId]);
      } else {
        mapRef.current.setFilter('zones-selected', ['==', ['get', 'zone_id'], '']);
      }
    } catch {
      // Safe fallback if layer not ready
    }
  }, [selectedZoneId]);

  // Fly to selected zone if available
  useEffect(() => {
    if (!mapRef.current || !selectedZoneId || !zonesGeoJSON) return;
    const feat = zonesGeoJSON.features.find((f) => f.properties.zone_id === selectedZoneId);
    if (feat && feat.geometry && feat.geometry.coordinates) {
      try {
        const coords = feat.geometry.coordinates[0];
        if (coords && coords.length > 0) {
          const lons = coords.map((c: number[]) => c[0]);
          const lats = coords.map((c: number[]) => c[1]);
          const minLon = Math.min(...lons);
          const maxLon = Math.max(...lons);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          mapRef.current.fitBounds(
            [
              [minLon, minLat],
              [maxLon, maxLat],
            ],
            { padding: 80, maxZoom: 12.5, duration: 800 }
          );
        }
      } catch {
        // Fallback gracefully
      }
    }
  }, [selectedZoneId, zonesGeoJSON]);

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: KARACHI_CENTER,
        zoom: INITIAL_ZOOM,
        duration: 800,
      });
    }
  };

  const handleZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  const toggleFacilityType = (type: FacilityType) => {
    setEnabledFacilityTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const zoneDetail = zoneDetailResponse?.data;

  // Selected Zone properties from zones list (immediate fallback while detail loads)
  const selectedZoneProps = useMemo(() => {
    if (!selectedZoneId || !zonesGeoJSON) return null;
    return zonesGeoJSON.features.find((f) => f.properties.zone_id === selectedZoneId)?.properties || null;
  }, [selectedZoneId, zonesGeoJSON]);

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col w-full flex-1 min-h-[calc(100vh-140px)] overflow-hidden bg-background"
    >
      {/* ------------------------------------------------------------------ */}
      {/* RESPONSIVE SINGLE CONTROL BAR (Requirement 5 & 8)                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-surface/95 dark:bg-surface-container-low/95 backdrop-blur-md border-b border-outline-variant/30 px-3 sm:px-6 py-2.5 shrink-0 z-20 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left Cluster: Hazard Mode Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="inline-flex items-center bg-surface-container-high dark:bg-surface-container-highest/60 p-1 rounded-xl border border-outline-variant/40"
            role="group"
            aria-label="Hazard type selection"
          >
            <button
              type="button"
              onClick={() => setHazardMode('heat')}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                hazardMode === 'heat'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] text-amber-400">thermostat</span>
              <span>Heatwave</span>
            </button>
            <button
              type="button"
              onClick={() => setHazardMode('rain')}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                hazardMode === 'rain'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] text-cyan-400">rainy</span>
              <span>Monsoon Rain</span>
            </button>
            <button
              type="button"
              onClick={() => setHazardMode('combined')}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                hazardMode === 'combined'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] text-error">warning</span>
              <span>Combined Risk</span>
            </button>
          </div>

          {/* Severity Filter Chips (Rule 4: Always text labels) */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Risk severity filter">
            {(['all', 'Severe', 'High', 'Moderate', 'Low'] as SeverityFilter[]).map((level) => {
              const isActive = severityFilter === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSeverityFilter(level)}
                  className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-mono font-medium transition-colors border flex items-center ${
                    isActive
                      ? level === 'Severe'
                        ? 'bg-error text-on-error border-error font-bold shadow-xs'
                        : level === 'High'
                        ? 'bg-[#C2410C] text-white border-[#C2410C] font-bold shadow-xs'
                        : level === 'Moderate'
                        ? 'bg-[#B45309] text-white border-[#B45309] font-bold shadow-xs'
                        : level === 'Low'
                        ? 'bg-[#059669] text-white border-[#059669] font-bold shadow-xs'
                        : 'bg-primary text-on-primary border-primary font-bold shadow-xs'
                      : 'bg-surface-container dark:bg-surface-container-high/60 text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high'
                  }`}
                >
                  {level === 'all'
                    ? 'All Tiers'
                    : level === 'Severe'
                    ? 'Severe (Red)'
                    : level === 'High'
                    ? 'High (Orange)'
                    : level === 'Moderate'
                    ? 'Moderate (Yellow)'
                    : 'Low (Green)'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Cluster: Facilities Layer Toggles & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Facility Toggles */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <label className="min-h-[44px] flex items-center gap-1.5 cursor-pointer bg-surface-container dark:bg-surface-container-high/60 px-2.5 py-1.5 rounded-xl text-xs text-on-surface hover:bg-surface-container-high transition-colors border border-outline-variant/30 select-none">
              <input
                type="checkbox"
                checked={enabledFacilityTypes.hospital}
                onChange={() => toggleFacilityType('hospital')}
                className="rounded text-error focus:ring-error w-4 h-4"
              />
              <span className="material-symbols-outlined text-[16px] text-error">local_hospital</span>
              <span className="hidden sm:inline">Hospitals</span>
            </label>

            <label className="min-h-[44px] flex items-center gap-1.5 cursor-pointer bg-surface-container dark:bg-surface-container-high/60 px-2.5 py-1.5 rounded-xl text-xs text-on-surface hover:bg-surface-container-high transition-colors border border-outline-variant/30 select-none">
              <input
                type="checkbox"
                checked={enabledFacilityTypes.school}
                onChange={() => toggleFacilityType('school')}
                className="rounded text-blue-500 focus:ring-blue-500 w-4 h-4"
              />
              <span className="material-symbols-outlined text-[16px] text-blue-500">school</span>
              <span className="hidden sm:inline">Schools</span>
            </label>

            <label className="min-h-[44px] flex items-center gap-1.5 cursor-pointer bg-surface-container dark:bg-surface-container-high/60 px-2.5 py-1.5 rounded-xl text-xs text-on-surface hover:bg-surface-container-high transition-colors border border-outline-variant/30 select-none">
              <input
                type="checkbox"
                checked={enabledFacilityTypes.shelter}
                onChange={() => toggleFacilityType('shelter')}
                className="rounded text-emerald-500 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="material-symbols-outlined text-[16px] text-emerald-500">night_shelter</span>
              <span className="hidden sm:inline">Shelters</span>
            </label>

            <label className="min-h-[44px] flex items-center gap-1.5 cursor-pointer bg-surface-container dark:bg-surface-container-high/60 px-2.5 py-1.5 rounded-xl text-xs text-on-surface hover:bg-surface-container-high transition-colors border border-outline-variant/30 select-none">
              <input
                type="checkbox"
                checked={enabledFacilityTypes.power_substation}
                onChange={() => toggleFacilityType('power_substation')}
                className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4"
              />
              <span className="material-symbols-outlined text-[16px] text-amber-500">bolt</span>
              <span className="hidden sm:inline">Power</span>
            </label>

            <label className="min-h-[44px] flex items-center gap-1.5 cursor-pointer bg-surface-container dark:bg-surface-container-high/60 px-2.5 py-1.5 rounded-xl text-xs text-on-surface hover:bg-surface-container-high transition-colors border border-outline-variant/30 select-none">
              <input
                type="checkbox"
                checked={enabledFacilityTypes.drainage_culvert}
                onChange={() => toggleFacilityType('drainage_culvert')}
                className="rounded text-cyan-500 focus:ring-cyan-500 w-4 h-4"
              />
              <span className="material-symbols-outlined text-[16px] text-cyan-500">water_loss</span>
              <span className="hidden sm:inline">Nullahs</span>
            </label>
          </div>

          <div className="h-5 w-px bg-outline-variant/40 hidden md:block" />

          {tilesOffline && (
            <span className="font-mono text-[10px] bg-amber-500/20 text-amber-500 border border-amber-500/40 px-2.5 py-1 rounded-full shrink-0">
              Vector Fallback Active
            </span>
          )}

          {/* Action buttons */}
          <button
            type="button"
            onClick={handleResetView}
            className="min-h-[44px] flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container dark:bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors border border-outline-variant/30"
            title="Reset map view to Karachi Division"
          >
            <span className="material-symbols-outlined text-[18px]">center_focus_strong</span>
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="min-h-[44px] flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container dark:bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors border border-outline-variant/30"
            title="Share link with current filters and selected zone"
          >
            <span className="material-symbols-outlined text-[18px]">share</span>
            <span>{copiedLink ? 'Copied!' : 'Share'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadGeoJSON}
            className="min-h-[44px] flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold transition-colors shadow-xs"
            title="Download GeoJSON FeatureCollection"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MAP CANVAS VIEWPORT (Fills remaining height, legend & drawer float) */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex-1 w-full h-[calc(100vh-140px)] min-h-[500px] overflow-hidden bg-[#0A1A2F]">
        {/* Map Container Element */}
        <div
          ref={mapContainerRef}
          className="absolute inset-0 w-full h-full"
          role="region"
          aria-label="Karachi Spatial Risk Map"
        />

        {/* Top-Left Floating Map Navigation Controls */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-surface/90 dark:bg-primary-container/90 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-outline-variant/30">
          <button
            type="button"
            onClick={handleZoomIn}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-surface-container/60 hover:bg-surface-container dark:bg-surface-container-highest/20 dark:hover:bg-surface-container-highest/40 text-on-surface dark:text-on-primary flex items-center justify-center transition-colors"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-surface-container/60 hover:bg-surface-container dark:bg-surface-container-highest/20 dark:hover:bg-surface-container-highest/40 text-on-surface dark:text-on-primary flex items-center justify-center transition-colors"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <span className="material-symbols-outlined text-[20px]">remove</span>
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-surface-container/60 hover:bg-surface-container dark:bg-surface-container-highest/20 dark:hover:bg-surface-container-highest/40 text-on-surface dark:text-on-primary flex items-center justify-center transition-colors"
            title="Reset View"
            aria-label="Reset View"
          >
            <span className="material-symbols-outlined text-[18px]">center_focus_strong</span>
          </button>
        </div>

        {/* Bottom-Left Floating Legend Pill (Rule 4: Always text labels) */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-auto flex flex-col gap-1.5 max-w-[320px]">
          <div className="bg-surface/95 dark:bg-primary/95 backdrop-blur-md p-3.5 rounded-2xl text-on-surface dark:text-on-primary shadow-xl border border-outline-variant/30 dark:border-primary-container">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant dark:text-on-primary-container font-semibold">
                Zone Risk Level
              </span>
              <span className="font-mono text-[10px] text-secondary">
                {hazardMode === 'heat' ? 'Heatwave' : hazardMode === 'rain' ? 'Monsoon' : 'Compound'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center font-mono text-[11px]">
                <div className="flex flex-col items-center">
                  <span className="w-full h-2 rounded bg-[#10B981] mb-1 shadow-xs" />
                  <span className="text-[10px] text-emerald-300 font-medium">Low (Green)</span>
                  <span className="text-[9px] text-on-primary-container">&lt;40%</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="w-full h-2 rounded bg-[#F59E0B] mb-1 shadow-xs" />
                  <span className="text-[10px] text-amber-300 font-medium">Moderate (Yellow)</span>
                  <span className="text-[9px] text-on-primary-container">40-65%</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="w-full h-2 rounded bg-[#EA580C] mb-1 shadow-xs" />
                  <span className="text-[10px] text-orange-300 font-medium">High (Orange)</span>
                  <span className="text-[9px] text-on-primary-container">65-80%</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="w-full h-2 rounded bg-[#DC2626] mb-1 shadow-xs" />
                  <span className="text-[10px] text-red-300 font-medium">Severe (Red)</span>
                  <span className="text-[9px] text-on-primary-container">&gt;80%</span>
                </div>
              </div>

              {/* Facility Marker Legend */}
              <div className="mt-2.5 pt-2 border-t border-primary-container flex items-center justify-between text-[10px] font-mono text-on-primary-container">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444]" /> Hospital
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#3B82F6]" /> School
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" /> Shelter
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Grid
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Hover Tooltip */}
          {hoveredZone && (
            <div
              className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
              style={{
                left: `${hoveredZone.x}px`,
                top: `${hoveredZone.y}px`,
              }}
            >
              <div className="bg-surface-container-lowest text-on-surface rounded-xl shadow-2xl border border-outline-variant/40 p-3 min-w-[260px] max-w-[320px]">
                <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-1.5 mb-2">
                  <span className="font-bold text-sm text-on-surface truncate">
                    {hoveredZone.properties.name}
                  </span>
                  <RiskBadge
                    level={hoveredZone.properties.risk_level}
                    label={hoveredZone.properties.risk_level}
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-xs">
                  {/* Probability with Uncertainty Interval (Rule 5) */}
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Forecast Probability:</span>
                    <span className="font-mono font-bold text-on-surface">
                      {Math.round(hoveredZone.properties.probability * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">
                    <span>Likely Interval (P10–P90):</span>
                    <span className="font-semibold text-on-surface">
                      {Math.round(hoveredZone.properties.interval[0] * 100)}% –{' '}
                      {Math.round(hoveredZone.properties.interval[1] * 100)}%
                    </span>
                  </div>

                  {/* Baseline Comparison (Rule 5) */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-on-surface-variant">Historical Baseline:</span>
                    <span className="font-mono text-on-surface font-semibold">
                      {Math.round(hoveredZone.properties.baseline_value * 100)}%
                    </span>
                  </div>

                  {/* Exposed Population */}
                  <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20">
                    <span className="text-on-surface-variant">Exposed Population:</span>
                    <span className="font-bold text-on-surface">
                      {hoveredZone.properties.exposed_population.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>Critical Facilities:</span>
                    <span className="font-semibold text-on-surface">
                      {hoveredZone.properties.facilities_count} units
                    </span>
                  </div>

                  <span className="font-mono text-[10px] text-secondary font-semibold pt-1 text-center">
                    Click to inspect detailed zone dossier →
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Loading or Empty State Overlay */}
          {isZonesLoading && (
            <div className="absolute inset-0 z-40 bg-[#0A1A2F]/80 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-on-primary">
                <span className="w-8 h-8 border-3 border-secondary border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-xs">Loading Karachi GIS Vector Grid...</span>
              </div>
            </div>
          )}

          {isZonesError && (
            <div className="absolute inset-0 z-40 bg-[#0A1A2F]/90 flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-surface p-4 rounded-xl shadow-xl">
                <EmptyState
                  icon="radar"
                  title="Spatial Grid Unavailable"
                  description="Unable to fetch zone choropleth layers from /api/map/zones. Verify backend database service."
                  actionText="Retry Connection"
                  onAction={() => { refetchZones(); }}
                />
              </div>
            </div>
          )}

          {/* Floating Zone Detail Drawer inside Map Viewport (Requirement 5) */}
          <AnimatePresence>
            {selectedZoneId && (
              <motion.aside
                initial={shouldReduceMotion ? { opacity: 1 } : { x: 40, opacity: 0 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { x: 40, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute top-4 right-4 bottom-4 w-[calc(100%-32px)] sm:w-[460px] xl:w-[500px] bg-surface/98 dark:bg-surface-container-lowest/98 backdrop-blur-2xl border border-outline-variant/40 rounded-2xl flex flex-col z-30 shadow-2xl overflow-hidden pointer-events-auto"
                aria-label="Zone Detailed Dossier"
              >
                {/* Drawer Header */}
                <div className="sticky top-0 z-20 bg-surface/95 dark:bg-surface-container-low/95 border-b border-outline-variant/30 p-4 shadow-xs flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {zoneDetail?.vulnerability?.risk_level ? (
                          <RiskBadge level={zoneDetail.vulnerability.risk_level} />
                        ) : selectedZoneProps?.risk_level ? (
                          <RiskBadge level={selectedZoneProps.risk_level} />
                        ) : null}
                        <span className="font-mono text-[11px] bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded">
                          Town Code: {selectedZoneId}
                        </span>
                      </div>
                      <h2 className="font-headline-md text-lg font-bold text-on-surface tracking-tight truncate">
                        {zoneDetail?.name || selectedZoneProps?.name || selectedZoneId}
                      </h2>
                      <span className="text-xs text-on-surface-variant">
                        Detailed Exposure Dossier · Karachi Division Municipal Ward
                      </span>
                    </div>

                    {/* Close Drawer Button */}
                    <button
                      type="button"
                      onClick={() => handleSelectZone(null)}
                      className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-surface-container-highest text-on-surface-variant flex items-center justify-center transition-colors shrink-0"
                      title="Close Detail Drawer"
                      aria-label="Close Detail Drawer"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  </div>

                  {/* Action Buttons: Export & GeoJSON */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="min-h-[44px] flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-surface-container dark:bg-surface-container-high/60 hover:bg-surface-container-highest text-on-surface text-xs font-medium transition-colors border border-outline-variant/30"
                    >
                      <span className="material-symbols-outlined text-[16px]">link</span>
                      <span>{copiedLink ? 'Copied URL!' : 'Share Dossier'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadGeoJSON}
                      className="min-h-[44px] flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl bg-surface-container dark:bg-surface-container-high/60 hover:bg-surface-container-highest text-on-surface text-xs font-medium transition-colors border border-outline-variant/30"
                    >
                      <span className="material-symbols-outlined text-[16px]">data_object</span>
                      <span>Export</span>
                    </button>
                  </div>

                  {/* 4 Tabs Navigation Bar: Hazard, Exposure, Vulnerability, Evidence */}
                  <div
                    className="grid grid-cols-4 gap-1 bg-surface-container-high dark:bg-surface-container-highest/60 p-1 rounded-xl mt-1 border border-outline-variant/30"
                    role="tablist"
                    aria-label="Zone Dossier Sections"
                  >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'hazard'}
                  onClick={() => setActiveTab('hazard')}
                  className={`py-1.5 px-1 rounded-lg text-xs font-medium text-center truncate transition-colors ${
                    activeTab === 'hazard'
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  1. Hazard
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'exposure'}
                  onClick={() => setActiveTab('exposure')}
                  className={`py-1.5 px-1 rounded-lg text-xs font-medium text-center truncate transition-colors ${
                    activeTab === 'exposure'
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  2. Exposure
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'vulnerability'}
                  onClick={() => setActiveTab('vulnerability')}
                  className={`py-1.5 px-1 rounded-lg text-xs font-medium text-center truncate transition-colors ${
                    activeTab === 'vulnerability'
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  3. Vulnerability
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'evidence'}
                  onClick={() => setActiveTab('evidence')}
                  className={`py-1.5 px-1 rounded-lg text-xs font-medium text-center truncate transition-colors ${
                    activeTab === 'evidence'
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  4. Evidence
                </button>
              </div>
            </div>

            {/* Drawer Body Content */}
            <div className="p-space-md flex flex-col gap-4">
              {isZoneDetailLoading ? (
                <div className="p-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <span className="w-7 h-7 border-3 border-secondary border-t-transparent rounded-full animate-spin" />
                  <span className="font-mono text-xs">Loading Zone Dossier from DuckDB...</span>
                </div>
              ) : isZoneDetailError || !zoneDetail ? (
                <EmptyState
                  icon="error"
                  title="Zone Details Missing"
                  description="Could not load the detailed telemetry records for this zone."
                  actionText="Retry"
                  onAction={() => { refetchZoneDetail(); }}
                />
              ) : (
                <>
                  {/* TAB 1: HAZARD */}
                  {activeTab === 'hazard' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wide">
                          Meteorological Hazard &amp; Forecast
                        </h3>
                        <span className="font-mono text-[11px] text-error font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-error animate-ping" /> Live Ensemble
                        </span>
                      </div>

                      {/* Primary Compound / Forecast Probability Card (Rule 5) */}
                      <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-on-surface-variant">Forecast Probability</span>
                          <span className="font-mono text-[11px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded">
                            {zoneDetail.hazard.warning_label}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-3xl font-bold text-error">
                            {Math.round(zoneDetail.hazard.probability * 100)}%
                          </span>
                          <span className="text-xs text-on-surface-variant">
                            vs Historical Baseline: {Math.round(zoneDetail.hazard.baseline_value * 100)}%
                          </span>
                        </div>

                        {/* Uncertainty Interval Range Bar (Rule 5) */}
                        <div className="flex flex-col gap-1 bg-surface-container p-2.5 rounded-lg border border-outline-variant/20">
                          <div className="flex items-center justify-between font-mono text-xs">
                            <span className="text-on-surface-variant">P10 (Low): {Math.round(zoneDetail.hazard.interval_low * 100)}%</span>
                            <span className="font-bold text-on-surface">Likely Range</span>
                            <span className="text-on-surface-variant">P90 (High): {Math.round(zoneDetail.hazard.interval_high * 100)}%</span>
                          </div>
                          <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden relative">
                            <div
                              className="absolute top-0 bottom-0 bg-error rounded-full"
                              style={{
                                left: `${Math.max(0, zoneDetail.hazard.interval_low * 100)}%`,
                                width: `${Math.min(100, (zoneDetail.hazard.interval_high - zoneDetail.hazard.interval_low) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Hazard Sub-metrics: WBGT & Rainfall Burst */}
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* WBGT Temperature */}
                        <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                          <span className="text-xs text-on-surface-variant">Wet Bulb Globe Temp</span>
                          <div className="flex items-baseline gap-1">
                            <span className="font-mono text-2xl font-bold text-error">
                              {zoneDetail.hazard.wbgt_celsius}
                            </span>
                            <span className="text-xs text-on-surface-variant">°C</span>
                          </div>
                          <span className="font-mono text-[10px] text-error">
                            Exceeds safety threshold (&gt;32°C)
                          </span>
                        </div>

                        {/* Peak 6h Monsoon Burst */}
                        <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                          <span className="text-xs text-on-surface-variant">Peak 6h Rain Burst</span>
                          <div className="flex items-baseline gap-1">
                            <span className="font-mono text-2xl font-bold text-secondary">
                              {zoneDetail.hazard.rainfall_6h_mm}
                            </span>
                            <span className="text-xs text-on-surface-variant">mm / 6h</span>
                          </div>
                          <span className="font-mono text-[10px] text-secondary">
                            Triggers street inundation
                          </span>
                        </div>
                      </div>

                      {/* Hazard Comparison Row */}
                      <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-2">
                        <span className="text-xs font-semibold text-on-surface">Sub-Hazard Probabilities</span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center justify-between p-2 rounded bg-surface-container">
                            <span className="text-on-surface-variant">Heat Hazard:</span>
                            <span className="font-mono font-bold text-on-surface">
                              {zoneDetail.hazard.heat_probability !== undefined && zoneDetail.hazard.heat_probability !== null
                                ? `${Math.round(zoneDetail.hazard.heat_probability * 100)}%`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-surface-container">
                            <span className="text-on-surface-variant">Heavy Rain:</span>
                            <span className="font-mono font-bold text-on-surface">
                              {zoneDetail.hazard.rain_probability !== undefined && zoneDetail.hazard.rain_probability !== null
                                ? `${Math.round(zoneDetail.hazard.rain_probability * 100)}%`
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: EXPOSURE */}
                  {activeTab === 'exposure' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wide">
                          Population &amp; Physical Exposure
                        </h3>
                        <span className="font-mono text-[11px] bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant">
                          Census 2023 Proj.
                        </span>
                      </div>

                      {/* Headline Population Card */}
                      <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs text-on-surface-variant">Total Exposed Population</span>
                          <span className="font-mono text-2xl font-bold text-on-surface">
                            {zoneDetail.exposure.exposed_population.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">Municipal Zone Residents</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-xs text-on-surface-variant">At-Risk Facilities</span>
                          <span className="font-mono text-2xl font-bold text-secondary">
                            {zoneDetail.exposure.facilities_count}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">Registered Units</span>
                        </div>
                      </div>

                      {/* Demographic Breakdown */}
                      {zoneDetail.exposure.demographics && (
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                            <span className="text-xs text-on-surface-variant">Children under 5</span>
                            <span className="font-mono text-xl font-bold text-on-surface">
                              {zoneDetail.exposure.demographics.children_under_5.toLocaleString()}
                            </span>
                            <span className="font-mono text-[10px] text-error font-medium">
                              Elevated dehydration risk
                            </span>
                          </div>

                          <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                            <span className="text-xs text-on-surface-variant">Elderly (Age 65+)</span>
                            <span className="font-mono text-xl font-bold text-on-surface">
                              {zoneDetail.exposure.demographics.elderly_65_plus.toLocaleString()}
                            </span>
                            <span className="font-mono text-[10px] text-error font-medium">
                              Cardiovascular heat risk
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Informal Settlements Exposure */}
                      {zoneDetail.exposure.demographics && (
                        <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-on-surface">
                              Informal Housing &amp; Corrugated Tin Thermal Trap
                            </span>
                            <span className="font-mono text-sm font-bold text-amber-600">
                              {zoneDetail.exposure.demographics.informal_settlements_pct}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${zoneDetail.exposure.demographics.informal_settlements_pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-on-surface-variant">
                            Corrugated sheets exacerbate radiant indoor temperature (+6°C), creating extreme thermal enclosures without cooling.
                          </p>
                        </div>
                      )}

                      {/* Critical Facilities in Zone */}
                      <div className="flex flex-col gap-2">
                        <span className="font-mono text-xs uppercase font-semibold text-on-surface-variant">
                          Critical Facilities in Zone ({zoneDetail.exposure.critical_facilities.length}):
                        </span>
                        {zoneDetail.exposure.critical_facilities.length === 0 ? (
                          <div className="p-3 bg-surface-container-low rounded-lg text-xs text-on-surface-variant">
                            No major tagged facility anchors within this immediate polygon.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                            {zoneDetail.exposure.critical_facilities.map((fac) => (
                              <div
                                key={fac.facility_id}
                                className="flex items-center justify-between p-2.5 bg-surface-container-low rounded-lg border border-outline-variant/20 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`material-symbols-outlined text-[18px] shrink-0 ${
                                      fac.type === 'hospital'
                                        ? 'text-error'
                                        : fac.type === 'school'
                                        ? 'text-blue-500'
                                        : fac.type === 'shelter'
                                        ? 'text-emerald-500'
                                        : 'text-amber-500'
                                    }`}
                                  >
                                    {fac.type === 'hospital'
                                      ? 'local_hospital'
                                      : fac.type === 'school'
                                      ? 'school'
                                      : fac.type === 'shelter'
                                      ? 'night_shelter'
                                      : 'domain'}
                                  </span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-semibold text-on-surface truncate">{fac.name}</span>
                                    <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                                      {fac.type.replace('_', ' ')} · {fac.facility_id}
                                    </span>
                                  </div>
                                </div>
                                <span className="font-mono text-[10px] text-on-surface-variant shrink-0">
                                  {fac.lat.toFixed(3)}, {fac.lon.toFixed(3)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: VULNERABILITY */}
                  {activeTab === 'vulnerability' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wide">
                          Physical &amp; Systemic Vulnerability
                        </h3>
                        <RiskBadge level={zoneDetail.vulnerability.risk_level} />
                      </div>

                      {/* Vulnerability Score Card */}
                      <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs text-on-surface-variant">Composite Vulnerability Score</span>
                          <span className="font-mono text-3xl font-bold text-error">
                            {zoneDetail.vulnerability.vulnerability_score.toFixed(2)}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">Scaled Index [0.00 – 1.00]</span>
                        </div>
                        <div className="flex flex-col text-right text-xs gap-1">
                          <span className="text-on-surface-variant">Heat Risk: <strong className="text-on-surface">{zoneDetail.vulnerability.heat_risk_level}</strong></span>
                          <span className="text-on-surface-variant">Rain Risk: <strong className="text-on-surface">{zoneDetail.vulnerability.rain_risk_level}</strong></span>
                        </div>
                      </div>

                      {/* Chokepoint Advisory */}
                      {zoneDetail.vulnerability.chokepoint_notes && (
                        <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-error text-xs font-semibold">
                            <span className="material-symbols-outlined text-[18px]">warning</span>
                            <span>Municipal Drainage &amp; Infrastructure Chokepoints</span>
                          </div>
                          <p className="text-xs text-on-surface-variant">
                            {zoneDetail.vulnerability.chokepoint_notes}
                          </p>
                        </div>
                      )}

                      {/* Impact Indicators Table */}
                      <div className="flex flex-col gap-2">
                        <span className="font-mono text-xs uppercase font-semibold text-on-surface-variant">
                          Verified Impact Indicators ({zoneDetail.vulnerability.indicators.length}):
                        </span>
                        {zoneDetail.vulnerability.indicators.length === 0 ? (
                          <div className="p-3 bg-surface-container-low rounded-lg text-xs text-on-surface-variant">
                            No domain-specific impact telemetry recorded for this zone yet.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {zoneDetail.vulnerability.indicators.map((ind, idx) => (
                              <div
                                key={`${ind.indicator}-${idx}`}
                                className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/20 flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-on-surface">{ind.indicator}</span>
                                  <span className="font-mono font-bold text-error">{ind.value}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                                  <span>Area: {ind.impact_area}</span>
                                  <span className="font-mono text-[10px] bg-surface-container px-1.5 py-0.5 rounded">
                                    Evidence: {ind.evidence_strength}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: EVIDENCE */}
                  {activeTab === 'evidence' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wide">
                          Evidence &amp; Provenance Audit
                        </h3>
                        <span className="font-mono text-[11px] bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded font-semibold">
                          ISO 19115 Traceable
                        </span>
                      </div>

                      {/* Provenance Header Card */}
                      <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-on-surface-variant">Simulation Engine:</span>
                          <span className="font-mono font-semibold text-on-surface">
                            {zoneDetail.evidence.model_provenance}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-on-surface-variant">Evidence Strength:</span>
                          <span className="font-mono font-bold uppercase text-secondary">
                            {zoneDetail.evidence.evidence_strength}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-on-surface-variant">Last Calibration:</span>
                          <span className="font-mono text-on-surface">
                            {zoneDetail.evidence.last_calibrated || 'Active Batch'}
                          </span>
                        </div>
                      </div>

                      {/* Sources and Row IDs List (Strict Requirement) */}
                      <div className="flex flex-col gap-2">
                        <span className="font-mono text-xs uppercase font-semibold text-on-surface-variant">
                          Audit Trail Sources &amp; Row IDs ({zoneDetail.evidence.sources.length}):
                        </span>
                        <div className="flex flex-col gap-2">
                          {zoneDetail.evidence.sources.map((src, i) => (
                            <div
                              key={`${src.source}-${src.row_ids}-${i}`}
                              className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/20 flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-on-surface truncate pr-2">
                                  {src.source}
                                </span>
                                <span className="font-mono text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded shrink-0">
                                  {src.row_ids}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                                <span className="truncate">Indicator: {src.indicator}</span>
                                <span className="font-mono text-[10px] text-secondary">
                                  Area: {src.impact_area}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Official Verification Signoff */}
                      <div className="p-3 bg-surface-container-high rounded-lg flex items-center justify-between text-on-surface-variant text-xs">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
                          <span>Verified by: Sindh PDMA &amp; PMD Liaison Cell</span>
                        </div>
                        <span className="font-mono text-[10px] text-on-surface-variant">
                          HASH: {selectedZoneId}-2026
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  </motion.div>
  );
};
