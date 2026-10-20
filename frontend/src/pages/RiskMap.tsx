import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import { api } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { EmptyState } from '../components/EmptyState';
import { Badge, Button, ErrorState, PageHeader, useToast } from '../components/ui';
import { BasemapTier, nextBasemapTier, styleForTier } from '../lib/mapBasemap';
import { boundsFromFeatures, KARACHI_BOUNDS, sanitizeZones } from '../lib/mapGeojson';
import { extrusionHeight, heightLegend, HeightMetric, preferFlatMap, supportsWebGL } from '../lib/mapHeight';
import { RiskLevel, ZoneDetailData, ZoneFeatureProperties } from '../types';

type HazardMode = 'heat' | 'rain' | 'combined';
type SeverityFilter = 'all' | RiskLevel;
type FacilityType = 'hospital' | 'school' | 'shelter' | 'power_substation' | 'drainage_culvert';
type DrawerTab = 'hazard' | 'exposure' | 'vulnerability' | 'evidence';
type MapMode = '2d' | '3d';

const RISK_COLOR: maplibregl.ExpressionSpecification = [
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
];

function addDistrictLayers(map: maplibregl.Map, use3d: boolean) {
  if (!map.getSource('zones-source')) {
    map.addSource('zones-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'zone_id',
    });
  }
  if (!map.getLayer('zones-fill')) {
    map.addLayer({
      id: 'zones-fill',
      type: 'fill',
      source: 'zones-source',
      paint: {
        'fill-color': ['case', ['==', ['get', 'has_metric'], 0], '#64748B', RISK_COLOR],
        'fill-opacity': use3d ? 0.22 : 0.65,
      },
    });
  }
  if (!map.getLayer('zones-extrusion')) {
    map.addLayer({
      id: 'zones-extrusion',
      type: 'fill-extrusion',
      source: 'zones-source',
      paint: {
        'fill-extrusion-color': ['case', ['==', ['get', 'has_metric'], 0], '#64748B', RISK_COLOR],
        'fill-extrusion-height': ['coalesce', ['get', 'extrusion_height'], 0],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.88,
      },
      layout: { visibility: use3d ? 'visible' : 'none' },
    });
  }
  if (!map.getLayer('zones-borders')) {
    map.addLayer({
      id: 'zones-borders',
      type: 'line',
      source: 'zones-source',
      paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-opacity': 0.8 },
    });
  }
  if (!map.getLayer('zones-selected')) {
    map.addLayer({
      id: 'zones-selected',
      type: 'line',
      source: 'zones-source',
      paint: { 'line-color': '#38BDF8', 'line-width': 3.2, 'line-opacity': 0.95 },
      filter: ['==', ['get', 'zone_id'], ''],
    });
  }
  if (!map.getSource('facilities-source')) {
    map.addSource('facilities-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('facilities-points')) {
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
        'circle-opacity': 0.95,
      },
    });
  }
}

interface RiskMapProps {
  isSample?: boolean;
}

export const RiskMap: React.FC<RiskMapProps> = () => {
  const shouldReduceMotion = useReducedMotion();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedZoneId = searchParams.get('zone') || searchParams.get('zone_id') || null;

  const [hazardMode, setHazardMode] = useState<HazardMode>('combined');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [enabledFacilityTypes, setEnabledFacilityTypes] = useState<Record<FacilityType, boolean>>({
    hospital: true,
    school: true,
    shelter: true,
    power_substation: false,
    drainage_culvert: false,
  });
  const [activeTab, setActiveTab] = useState<DrawerTab>('hazard');
  const [hoveredZone, setHoveredZone] = useState<{
    properties: ZoneFeatureProperties;
    x: number;
    y: number;
  } | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [useTableFallback, setUseTableFallback] = useState(false);
  const [heightMetric, setHeightMetric] = useState<HeightMetric>('exposed_population');
  const [force3d, setForce3d] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>(() => {
    try {
      const saved = localStorage.getItem('cs-map-mode');
      if (saved === '2d' || saved === '3d') return saved;
    } catch {
      /* ignore */
    }
    return preferFlatMap() ? '2d' : '3d';
  });

  const webglOk = supportsWebGL();
  const flatPreferred = preferFlatMap() && !force3d;
  const use3d = mapMode === '3d' && webglOk && !flatPreferred;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const basemapTierRef = useRef<BasemapTier>('openfreemap');
  const use3dRef = useRef(use3d);
  const hoveredIdRef = useRef<string | number | null>(null);
  const interactionsBoundRef = useRef(false);
  const zonesDataRef = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const facilitiesDataRef = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });

  use3dRef.current = use3d;

  const {
    data: zonesResponse,
    isLoading: isZonesLoading,
    isError: isZonesError,
    isSuccess: isZonesSuccess,
    refetch: refetchZones,
  } = useQuery({
    queryKey: ['map-zones', hazardMode],
    queryFn: () => api.getMapZones(hazardMode),
    refetchInterval: 60000,
  });

  const activeFacilityTypesParam = useMemo(
    () =>
      Object.entries(enabledFacilityTypes)
        .filter(([, enabled]) => enabled)
        .map(([type]) => type),
    [enabledFacilityTypes]
  );

  const { data: facilitiesResponse } = useQuery({
    queryKey: ['map-facilities', activeFacilityTypesParam.join(',')],
    queryFn: () => api.getMapFacilities(activeFacilityTypesParam),
    refetchInterval: 60000,
  });

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

  const { data: statusResponse } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: 60000,
  });

  // /api/meta has no is_live; match freshness card via /api/status status_indicator
  const freshnessTone =
    statusResponse?.data?.status_indicator === 'failed'
      ? 'Failed'
      : statusResponse?.data?.status_indicator === 'late'
        ? 'Late'
        : statusResponse?.data?.status_indicator === 'ok'
          ? 'Live'
          : 'Unknown';

  const sanitized = useMemo(
    () => sanitizeZones(zonesResponse?.data, heightMetric),
    [zonesResponse?.data, heightMetric]
  );

  // Deep-clone every time — MapLibre mutates FeatureCollections in place and would
  // otherwise empty the memoized React data (shows "No district polygons").
  const filteredZones = useMemo(() => {
    const features =
      severityFilter === 'all'
        ? sanitized.collection.features
        : sanitized.collection.features.filter((f) => f.properties.risk_level === severityFilter);
    return structuredClone({
      type: 'FeatureCollection' as const,
      features,
    });
  }, [sanitized.collection, severityFilter]);

  // Snapshot for MapLibre only — never hand React-owned objects to setData.
  zonesDataRef.current = structuredClone(filteredZones) as unknown as GeoJSON.FeatureCollection;
  facilitiesDataRef.current = (facilitiesResponse?.data || {
    type: 'FeatureCollection',
    features: [],
  }) as unknown as GeoJSON.FeatureCollection;

  const handleSelectZone = useCallback(
    (zoneId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (zoneId) next.set('zone', zoneId);
      else {
        next.delete('zone');
        next.delete('zone_id');
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const syncSources = useCallback((map: maplibregl.Map) => {
    try {
      // Always pass a fresh deep clone — never the React-owned collection.
      const zonesPayload = structuredClone(zonesDataRef.current);
      const facPayload = structuredClone(facilitiesDataRef.current);
      const zones = map.getSource('zones-source') as maplibregl.GeoJSONSource | undefined;
      zones?.setData(zonesPayload as any);
      const fac = map.getSource('facilities-source') as maplibregl.GeoJSONSource | undefined;
      fac?.setData(facPayload as any);
    } catch (err) {
      console.error('[RiskMap] syncSources failed', err);
    }
  }, []);

  const attachInteractions = useCallback(
    (map: maplibregl.Map) => {
      if (interactionsBoundRef.current) return;
      interactionsBoundRef.current = true;

      let tipRaf = 0;
      let pendingPoint: { x: number; y: number } | null = null;
      let lastProps: ZoneFeatureProperties | null = null;
      let lastZoneId: string | null = null;

      const flushTip = () => {
        tipRaf = 0;
        if (!pendingPoint || !lastProps) return;
        const point = pendingPoint;
        pendingPoint = null;
        setHoveredZone({ properties: lastProps, x: point.x, y: point.y });
      };

      const onMove = (e: maplibregl.MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const feat = e.features[0];
        const props = feat.properties as unknown as ZoneFeatureProperties;
        const id = String(feat.id ?? props.zone_id ?? '');
        // Tooltip only — no setFeatureState. Feature-state + fill-extrusion + CSS
        // blur near the canvas blanks WebGL on Windows GPUs.
        let intervalArr: [number, number] = [props.interval_low, props.interval_high];
        if (typeof (props as any).interval === 'string') {
          try {
            intervalArr = JSON.parse((props as any).interval);
          } catch {
            /* keep */
          }
        }
        if (id !== lastZoneId) {
          lastZoneId = id;
          lastProps = { ...props, interval: intervalArr };
        }
        pendingPoint = { x: e.point.x, y: e.point.y };
        if (!tipRaf) tipRaf = requestAnimationFrame(flushTip);
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = '';
        if (tipRaf) {
          cancelAnimationFrame(tipRaf);
          tipRaf = 0;
        }
        pendingPoint = null;
        lastProps = null;
        lastZoneId = null;
        hoveredIdRef.current = null;
        setHoveredZone(null);
      };
      const onClick = (e: maplibregl.MapLayerMouseEvent) => {
        const zid = e.features?.[0]?.properties?.zone_id;
        if (zid) handleSelectZone(String(zid));
      };
      ['zones-fill', 'zones-extrusion'].forEach((layer) => {
        map.on('mousemove', layer, onMove);
        map.on('mouseleave', layer, onLeave);
        map.on('click', layer, onClick);
      });
      map.on('click', 'facilities-points', (e) => {
        const zid = e.features?.[0]?.properties?.zone_id;
        if (zid) handleSelectZone(String(zid));
      });
    },
    [handleSelectZone]
  );

  const onStyleReady = useCallback(
    (map: maplibregl.Map) => {
      mapLoadedRef.current = true;
      setMapReady(true);
      try {
        addDistrictLayers(map, use3dRef.current);
        attachInteractions(map);
        syncSources(map);
        map.resize();
      } catch (err) {
        console.error('[RiskMap] layer setup failed', err);
        setMapError(err instanceof Error ? err.message : 'Failed to add map layers');
        setUseTableFallback(true);
      }
    },
    [attachInteractions, syncSources]
  );

  const basemapFallbackLockRef = useRef(false);

  const applyBasemapFallback = useCallback(
    (map: maplibregl.Map, reason: string) => {
      // Guard against error storms blanking the map via repeated setStyle.
      if (basemapFallbackLockRef.current) return;
      const next = nextBasemapTier(basemapTierRef.current);
      console.warn(`[RiskMap] Basemap fallback (${basemapTierRef.current} → ${next}): ${reason}`);
      if (!next) {
        setMapError(reason);
        setUseTableFallback(true);
        toast.push(reason, 'warn');
        return;
      }
      basemapFallbackLockRef.current = true;
      basemapTierRef.current = next;
      mapLoadedRef.current = false;
      interactionsBoundRef.current = false;
      try {
        map.setStyle(styleForTier(next) as any);
        toast.push(
          next === 'osm'
            ? 'OpenFreeMap unavailable — using OpenStreetMap raster.'
            : 'Tiles unavailable — districts on a dark canvas.',
          'warn'
        );
      } catch (err) {
        console.error('[RiskMap] setStyle fallback failed', err);
        setMapError(String(err));
        setUseTableFallback(true);
      } finally {
        window.setTimeout(() => {
          basemapFallbackLockRef.current = false;
        }, 2500);
      }
    },
    [toast]
  );

  const initMap = useCallback(() => {
    if (!mapContainerRef.current) return;
    if (!webglOk) {
      setUseTableFallback(true);
      setMapError('WebGL is unavailable. Showing the district table.');
      return;
    }
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
      interactionsBoundRef.current = false;
    }

    setMapError(null);
    setUseTableFallback(false);
    setMapReady(false);
    basemapTierRef.current = 'openfreemap';

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleForTier('openfreemap') as any,
      bounds: KARACHI_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      minZoom: 5,
      maxZoom: 18,
      pitch: use3dRef.current ? 55 : 0,
      bearing: use3dRef.current ? -20 : 0,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');

    map.on('error', (event) => {
      const message = String(event.error?.message || event.error || 'Map error');
      console.error('[RiskMap]', message, event.error);
      const lower = message.toLowerCase();
      // Only fall back on hard style/tile load failures — not transient render noise
      // (broad "failed" matching previously blanked the map during hover/interaction).
      const isBasemapFailure =
        (lower.includes('style') && (lower.includes('load') || lower.includes('fetch') || lower.includes('ajax'))) ||
        (lower.includes('tile') && (lower.includes('404') || lower.includes('403') || lower.includes('failed'))) ||
        lower.includes('failed to fetch') ||
        lower.includes('ajaxerror');
      if (isBasemapFailure) {
        toast.push(message, 'warn');
        applyBasemapFallback(map, message);
      }
    });

    map.on('load', () => onStyleReady(map));
    map.on('style.load', () => onStyleReady(map));

    mapRef.current = map;
  }, [applyBasemapFallback, onStyleReady, toast, webglOk]);

  useEffect(() => {
    initMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapLoadedRef.current = false;
        interactionsBoundRef.current = false;
      }
      setMapReady(false);
    };
    // StrictMode-safe: remove on cleanup; recreate on remount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node || !mapRef.current) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => mapRef.current?.resize());
    });
    ro.observe(node);
    requestAnimationFrame(() => mapRef.current?.resize());
    return () => ro.disconnect();
  }, [mapReady, selectedZoneId, useTableFallback, legendOpen]);

  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    syncSources(mapRef.current);
    const b = boundsFromFeatures(filteredZones);
    if (b && filteredZones.features.length > 0 && !selectedZoneId) {
      try {
        mapRef.current.fitBounds(b, {
          padding: 48,
          duration: shouldReduceMotion ? 0 : 600,
          maxZoom: 11.5,
        });
      } catch {
        /* ignore */
      }
    }
  }, [filteredZones, shouldReduceMotion, mapReady, syncSources, selectedZoneId]);

  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    syncSources(mapRef.current);
  }, [facilitiesResponse, mapReady, syncSources]);

  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    try {
      mapRef.current.setFilter('zones-selected', ['==', ['get', 'zone_id'], selectedZoneId || '']);
    } catch {
      /* ignore */
    }
  }, [selectedZoneId, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !selectedZoneId) return;
    const feat = filteredZones.features.find((f) => f.properties.zone_id === selectedZoneId);
    if (!feat?.geometry) return;
    try {
      const coords =
        feat.geometry.type === 'Polygon'
          ? feat.geometry.coordinates[0]
          : feat.geometry.coordinates[0][0];
      const lons = coords.map((c: number[]) => c[0]);
      const lats = coords.map((c: number[]) => c[1]);
      mapRef.current.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        {
          padding: 80,
          maxZoom: 12.5,
          duration: shouldReduceMotion ? 0 : 800,
          pitch: use3d ? 55 : 0,
        }
      );
      requestAnimationFrame(() => mapRef.current?.resize());
    } catch {
      /* ignore */
    }
  }, [selectedZoneId, filteredZones, shouldReduceMotion, use3d]);

  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    const map = mapRef.current;
    try {
      localStorage.setItem('cs-map-mode', mapMode);
      if (map.getLayer('zones-extrusion')) {
        map.setLayoutProperty('zones-extrusion', 'visibility', use3d ? 'visible' : 'none');
      }
      if (map.getLayer('zones-fill')) {
        map.setPaintProperty('zones-fill', 'fill-opacity', use3d ? 0.22 : 0.65);
      }
      map.easeTo({
        pitch: use3d ? 55 : 0,
        bearing: use3d ? -20 : 0,
        duration: shouldReduceMotion ? 0 : 800,
      });
    } catch (err) {
      console.error('[RiskMap] mode switch failed', err);
    }
  }, [mapMode, use3d, shouldReduceMotion, mapReady]);

  const zoneDetail = zoneDetailResponse?.data;
  const selectedProps =
    filteredZones.features.find((f) => f.properties.zone_id === selectedZoneId)?.properties || null;

  const drawerTitle = selectedProps?.name || zoneDetail?.name || 'Selected district';
  const drawerSubtitle = [
    zoneDetail?.name || selectedProps?.name,
    selectedZoneId ? `Zone ${selectedZoneId}` : null,
    selectedProps?.hazard_type ? `Hazard: ${selectedProps.hazard_type}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const drawerRisk: RiskLevel =
    selectedProps?.risk_level ||
    zoneDetail?.vulnerability?.risk_level ||
    'Low';

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <div className="shrink-0 px-3 sm:px-4 pt-3">
        <PageHeader
          title="Risk Map"
          subtitle="Pakistan-wide district exposure — height encodes warehouse metrics only."
          badge={
            <Badge
              tone={
                freshnessTone === 'Live'
                  ? 'ok'
                  : freshnessTone === 'Late'
                    ? 'warn'
                    : freshnessTone === 'Failed'
                      ? 'danger'
                      : 'neutral'
              }
            >
              {freshnessTone}
            </Badge>
          }
        />
      </div>

      {/* Compact control bar */}
      <div className="shrink-0 border-b border-outline-variant/30 cs-glass px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2 z-20">
        <div className="hidden md:inline-flex items-center bg-surface-container-high p-1 rounded-xl border border-outline-variant/40">
          {(['heat', 'rain', 'combined'] as HazardMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setHazardMode(mode)}
              className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold ${
                hazardMode === mode ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'
              }`}
            >
              {mode === 'heat' ? 'Heat' : mode === 'rain' ? 'Rain' : 'Combined'}
            </button>
          ))}
        </div>

        <label className="hidden md:flex items-center gap-1 text-xs text-on-surface-variant">
          Severity
          <select
            className="min-h-[44px] rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 text-xs text-on-surface"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            aria-label="Severity filter"
          >
            <option value="all">All tiers</option>
            <option value="Severe">Severe</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </label>

        <div className="relative">
          <Button variant="ghost" className="min-h-[44px] px-3 text-xs" onClick={() => setLayersOpen((v) => !v)}>
            Layers
          </Button>
          {layersOpen && (
            <div className="absolute left-0 mt-1 z-40 w-56 rounded-xl border border-outline-variant/40 cs-glass p-2 shadow-lg">
              {(Object.keys(enabledFacilityTypes) as FacilityType[]).map((type) => (
                <label key={type} className="flex items-center gap-2 min-h-[44px] px-2 text-xs capitalize">
                  <input
                    type="checkbox"
                    checked={enabledFacilityTypes[type]}
                    onChange={() =>
                      setEnabledFacilityTypes((prev) => ({ ...prev, [type]: !prev[type] }))
                    }
                  />
                  {type.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative ml-auto flex items-center gap-1">
          <button
            type="button"
            className="md:hidden min-h-[44px] px-3 rounded-xl border border-outline-variant/40 text-xs"
            onClick={() => setFilterSheetOpen(true)}
          >
            Filters
          </button>
          <Button variant="ghost" className="min-h-[44px] px-3 text-xs" onClick={() => setMoreOpen((v) => !v)}>
            ···
          </Button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 w-44 rounded-xl border border-outline-variant/40 cs-glass p-1 shadow-lg">
              <button
                type="button"
                className="w-full text-left min-h-[44px] px-3 text-xs rounded-lg hover:bg-surface-container"
                onClick={() => {
                  const b = boundsFromFeatures(filteredZones) || KARACHI_BOUNDS;
                  mapRef.current?.fitBounds(b, { padding: 40, duration: 600 });
                  setMoreOpen(false);
                }}
              >
                Reset view
              </button>
              <button
                type="button"
                className="w-full text-left min-h-[44px] px-3 text-xs rounded-lg hover:bg-surface-container"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.push('Link copied', 'ok');
                  setMoreOpen(false);
                }}
              >
                Share
              </button>
              <button
                type="button"
                className="w-full text-left min-h-[44px] px-3 text-xs rounded-lg hover:bg-surface-container"
                onClick={() => {
                  if (!zonesResponse?.data) return;
                  const blob = new Blob([JSON.stringify(zonesResponse.data, null, 2)], {
                    type: 'application/geo+json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `climateshield-zones-${hazardMode}.geojson`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setMoreOpen(false);
                }}
              >
                Export GeoJSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map + drawer */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <div className="relative flex-1 min-h-[280px] min-w-0 bg-[#0B1224]">
          {!useTableFallback && (
            <div
              ref={mapContainerRef}
              className="absolute inset-0 w-full h-full isolate [transform:translateZ(0)] [&_.maplibregl-canvas]:!block [&_.maplibregl-ctrl-top-right]:top-4 [&_.maplibregl-ctrl-top-right]:right-4 [&_.maplibregl-ctrl-bottom-right]:bottom-4 [&_.maplibregl-ctrl-bottom-right]:right-4"
              role="region"
              aria-label="Pakistan spatial risk map"
              data-testid="risk-map-canvas"
            />
          )}

          {/* Custom 2D/3D control — top-right under nav controls */}
          {!useTableFallback && (
            <div className="absolute top-[120px] right-4 z-20 flex flex-col gap-1">
              <button
                type="button"
                className={`min-h-[44px] min-w-[44px] rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs font-bold ${
                  mapMode === '2d' ? 'bg-secondary text-on-secondary' : ''
                }`}
                onClick={() => setMapMode('2d')}
                aria-pressed={mapMode === '2d'}
              >
                2D
              </button>
              <button
                type="button"
                className={`min-h-[44px] min-w-[44px] rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs font-bold ${
                  mapMode === '3d' ? 'bg-secondary text-on-secondary' : ''
                }`}
                onClick={() => {
                  setForce3d(true);
                  setMapMode('3d');
                }}
                aria-pressed={mapMode === '3d'}
                disabled={!webglOk}
              >
                3D
              </button>
            </div>
          )}

          {useTableFallback && (
            <div className="absolute inset-0 overflow-auto p-4">
              {mapError && (
                <ErrorState
                  title="Map unavailable"
                  detail={mapError}
                  onRetry={() => {
                    setUseTableFallback(false);
                    requestAnimationFrame(() => initMap());
                  }}
                />
              )}
              <div className="mt-3 rounded-xl border border-outline-variant/30 overflow-hidden" data-testid="risk-map-table">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">District</th>
                      <th className="px-3 py-2 text-left">Risk</th>
                      <th className="px-3 py-2 text-left">Population</th>
                      <th className="px-3 py-2 text-left">Height metric</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredZones.features.map((f) => (
                      <tr
                        key={f.properties.zone_id}
                        className="border-t border-outline-variant/20 hover:bg-surface-container/40 cursor-pointer"
                        onClick={() => handleSelectZone(f.properties.zone_id)}
                      >
                        <td className="px-3 py-2">{f.properties.name}</td>
                        <td className="px-3 py-2">
                          <RiskBadge level={f.properties.risk_level} />
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {f.properties.exposed_population?.toLocaleString?.() ?? 'n/a'}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {extrusionHeight(heightMetric, f.properties).toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isZonesLoading && !mapReady && !useTableFallback && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="cs-skeleton h-10 w-48 rounded-xl" />
            </div>
          )}

          {isZonesError && (
            <div className="absolute inset-4 z-30">
              <ErrorState title="Zones failed to load" onRetry={() => refetchZones()} />
            </div>
          )}

          {isZonesSuccess &&
            (zonesResponse?.data?.features?.length ?? 0) === 0 &&
            filteredZones.features.length === 0 &&
            !isZonesError && (
            <div className="absolute inset-4 z-30 pointer-events-none">
              <EmptyState
                icon="map"
                title="No district polygons"
                description="No predictions yet for these filters, or geometry is missing from the warehouse."
              />
            </div>
          )}

          {/* Legend — bottom-left */}
          <div className="absolute bottom-4 left-4 z-20 max-w-[min(320px,calc(100%-2rem))]">
            <button
              type="button"
              className="min-h-[44px] px-3 mb-1 rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-xs font-semibold"
              onClick={() => setLegendOpen((v) => !v)}
            >
              {legendOpen ? 'Hide legend' : 'Show legend'}
            </button>
            {legendOpen && (
              <div className="bg-surface-container-lowest/95 border border-outline-variant/40 rounded-2xl p-3 shadow-lg text-on-surface">
                <p className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-2">
                  Zone risk level
                </p>
                <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-mono mb-3">
                  <div>
                    <span className="block h-2 rounded bg-[#10B981] mb-1" />
                    Low
                  </div>
                  <div>
                    <span className="block h-2 rounded bg-[#F59E0B] mb-1" />
                    Moderate
                  </div>
                  <div>
                    <span className="block h-2 rounded bg-[#EA580C] mb-1" />
                    High
                  </div>
                  <div>
                    <span className="block h-2 rounded bg-[#DC2626] mb-1" />
                    Severe
                  </div>
                </div>
                <label className="block text-[10px] font-mono uppercase text-on-surface-variant">
                  Height shows
                  <select
                    className="mt-1 w-full min-h-[44px] rounded-lg bg-surface-container-lowest border border-outline-variant/40 px-2 text-xs text-on-surface"
                    value={heightMetric}
                    onChange={(e) => setHeightMetric(e.target.value as HeightMetric)}
                  >
                    <option value="exposed_population">Exposed population</option>
                    <option value="probability">Hazard probability</option>
                    <option value="vulnerability_score">Vulnerability score</option>
                  </select>
                </label>
                <p className="mt-2 text-[10px] text-on-surface-variant">{heightLegend(heightMetric)}</p>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Height encodes the selected metric. Districts without data stay flat and grey.
                </p>
                {flatPreferred && mapMode !== '3d' && (
                  <p className="mt-1 text-[10px] text-amber-500">3D disabled for performance — toggle 3D to override.</p>
                )}
              </div>
            )}
          </div>

          {hoveredZone && (
            <div
              className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-full"
              style={{ left: hoveredZone.x, top: hoveredZone.y }}
            >
              {/* Solid panel — avoid backdrop-filter near the WebGL canvas (can blank the map on Windows). */}
              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 min-w-[220px] text-xs shadow-xl">
                <p className="font-semibold text-on-surface">{hoveredZone.properties.name}</p>
                <RiskBadge level={hoveredZone.properties.risk_level} className="mt-1" />
                <p className="mt-2 font-mono text-on-surface-variant tabular-nums">
                  P: {(Number(hoveredZone.properties.probability) * 100).toFixed(1)}% · interval{' '}
                  {hoveredZone.properties.interval_low}–{hoveredZone.properties.interval_high}
                </p>
                <p className="font-mono text-on-surface-variant tabular-nums">
                  Exposed: {hoveredZone.properties.exposed_population?.toLocaleString?.() ?? 'n/a'}
                </p>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedZoneId && (
            <motion.aside
              initial={shouldReduceMotion ? false : { x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { x: 24, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:flex w-[360px] shrink-0 border-l border-outline-variant/30 bg-surface-container-lowest flex-col min-h-0"
              role="dialog"
              aria-label="District dossier"
            >
              <DrawerBody
                title={drawerTitle}
                subtitle={drawerSubtitle}
                zoneId={selectedZoneId}
                risk={drawerRisk}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                loading={isZoneDetailLoading}
                error={isZoneDetailError}
                onRetry={() => refetchZoneDetail()}
                onClose={() => handleSelectZone(null)}
                zoneDetail={zoneDetail}
                selectedProps={selectedProps}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedZoneId && (
          <motion.div
            className="lg:hidden fixed inset-x-0 bottom-14 sm:bottom-0 z-40"
            initial={shouldReduceMotion ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={shouldReduceMotion ? undefined : { y: '100%' }}
            transition={{ duration: 0.25 }}
          >
            <div className="mx-2 mb-2 h-[60vh] rounded-t-2xl border border-outline-variant/40 cs-glass flex flex-col overflow-hidden shadow-2xl">
              <DrawerBody
                title={drawerTitle}
                subtitle={drawerSubtitle}
                zoneId={selectedZoneId}
                risk={drawerRisk}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                loading={isZoneDetailLoading}
                error={isZoneDetailError}
                onRetry={() => refetchZoneDetail()}
                onClose={() => handleSelectZone(null)}
                zoneDetail={zoneDetail}
                selectedProps={selectedProps}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filterSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close filters"
            onClick={() => setFilterSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl cs-glass border border-outline-variant/40 p-4 pb-20 space-y-3">
            <p className="font-semibold text-sm">Map filters</p>
            <div className="flex flex-wrap gap-2">
              {(['heat', 'rain', 'combined'] as HazardMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`min-h-[44px] px-3 rounded-xl text-xs capitalize ${
                    hazardMode === mode ? 'bg-secondary text-on-secondary' : 'bg-surface-container'
                  }`}
                  onClick={() => setHazardMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <select
              className="w-full min-h-[44px] rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            >
              <option value="all">All tiers</option>
              <option value="Severe">Severe</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
            <Button className="w-full min-h-[44px]" onClick={() => setFilterSheetOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

function DrawerBody({
  title,
  subtitle,
  zoneId,
  risk,
  activeTab,
  setActiveTab,
  loading,
  error,
  onRetry,
  onClose,
  zoneDetail,
  selectedProps,
}: {
  title: string;
  subtitle: string;
  zoneId: string;
  risk: RiskLevel;
  activeTab: DrawerTab;
  setActiveTab: (t: DrawerTab) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
  zoneDetail?: ZoneDetailData;
  selectedProps: ZoneFeatureProperties | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="sticky top-0 z-10 cs-glass border-b border-outline-variant/30 px-4 py-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <RiskBadge level={risk} />
            <p className="mt-1 font-mono text-[10px] text-on-surface-variant">Zone {zoneId}</p>
            <h2 className="font-display font-semibold text-on-surface truncate">{title}</h2>
            <p className="text-xs text-on-surface-variant line-clamp-2">{subtitle}</p>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-surface-container"
            aria-label="Close district drawer"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
          {(
            [
              ['hazard', '1. Hazard'],
              ['exposure', '2. Exposure'],
              ['vulnerability', '3. Vulnerability'],
              ['evidence', '4. Evidence'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold shrink-0 ${
                activeTab === id ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 text-sm">
        {loading && <div className="cs-skeleton h-24 rounded-xl" />}
        {error && <ErrorState title="District detail failed" onRetry={onRetry} />}
        {!loading && !error && activeTab === 'hazard' && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-on-surface-variant">Meteorological hazard</p>
            <p className="text-on-surface-variant text-xs">
              {zoneDetail?.hazard?.warning_label || 'No separate district forecast row.'}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-surface-container p-3">
                <dt className="text-on-surface-variant">Probability</dt>
                <dd className="font-mono tabular-nums font-semibold">
                  {selectedProps?.probability != null
                    ? `${(selectedProps.probability * 100).toFixed(1)}%`
                    : zoneDetail?.hazard?.probability != null
                      ? `${(zoneDetail.hazard.probability * 100).toFixed(1)}%`
                      : 'n/a'}
                </dd>
              </div>
              <div className="rounded-xl bg-surface-container p-3">
                <dt className="text-on-surface-variant">Interval</dt>
                <dd className="font-mono tabular-nums font-semibold">
                  {selectedProps
                    ? `${selectedProps.interval_low}–${selectedProps.interval_high}`
                    : zoneDetail?.hazard?.interval_low != null
                      ? `${zoneDetail.hazard.interval_low}–${zoneDetail.hazard.interval_high}`
                      : 'n/a'}
                </dd>
              </div>
            </dl>
          </div>
        )}
        {!loading && !error && activeTab === 'exposure' && (
          <dl className="space-y-2 text-xs">
            <div className="rounded-xl bg-surface-container p-3">
              <dt className="text-on-surface-variant">Exposed population</dt>
              <dd className="font-mono tabular-nums text-base font-semibold">
                {(
                  zoneDetail?.exposure?.exposed_population ?? selectedProps?.exposed_population
                )?.toLocaleString?.() ?? 'n/a'}
              </dd>
            </div>
            <div className="rounded-xl bg-surface-container p-3">
              <dt className="text-on-surface-variant">Facilities</dt>
              <dd className="font-mono tabular-nums text-base font-semibold">
                {zoneDetail?.exposure?.facilities_count ?? selectedProps?.facilities_count ?? 'n/a'}
              </dd>
            </div>
          </dl>
        )}
        {!loading && !error && activeTab === 'vulnerability' && (
          <div className="rounded-xl bg-surface-container p-3 text-xs">
            <p className="text-on-surface-variant">Vulnerability score</p>
            <p className="font-mono tabular-nums text-lg font-semibold">
              {(
                zoneDetail?.vulnerability?.vulnerability_score ?? selectedProps?.vulnerability_score
              )?.toFixed?.(2) ?? 'n/a'}
            </p>
          </div>
        )}
        {!loading && !error && activeTab === 'evidence' && (
          <div className="space-y-2 text-xs text-on-surface-variant">
            {(zoneDetail?.evidence?.sources || []).length === 0 && (
              <p>No evidence rows returned for this district.</p>
            )}
            {(zoneDetail?.evidence?.sources || []).map((src, idx) => (
              <div key={`${src.source}-${idx}`} className="rounded-xl bg-surface-container p-3">
                <p className="font-semibold text-on-surface">{src.source}</p>
                <p className="font-mono break-all">{src.row_ids}</p>
              </div>
            ))}
          </div>
        )}
        <div className="h-8" aria-hidden />
      </div>
    </>
  );
}

export default RiskMap;
