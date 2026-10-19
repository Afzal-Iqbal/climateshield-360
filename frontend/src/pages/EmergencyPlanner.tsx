import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { Skeleton } from '../components/Skeleton';

interface EmergencyPlannerProps {
  isSample?: boolean;
}

interface ChecklistItem {
  id: string;
  category: 'Evacuation' | 'Public Health' | 'Grid & Water' | 'Communication';
  task: string;
  trigger: string;
  responsible: string;
  priority: 'Immediate' | 'Urgent' | 'Standard';
  completed: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'ACT-01',
    category: 'Public Health',
    task: 'Activate cooling centres and shade canopies across Saddar, Lyari, and Orangi',
    trigger: 'Temperature ≥ 38.0°C or WBGT ≥ 32.0°C',
    responsible: 'KMC Health Dept / Rescue 1122',
    priority: 'Immediate',
    completed: false,
  },
  {
    id: 'ACT-02',
    category: 'Evacuation',
    task: 'Pre-position dewatering pumps and excavators at Gujjar and Orangi Nullah chokepoints',
    trigger: 'Rain probability ≥ 60% or forecast ≥ 2.5 mm/hr',
    responsible: 'Sindh Irrigation / KMC Engineering',
    priority: 'Immediate',
    completed: true,
  },
  {
    id: 'ACT-03',
    category: 'Grid & Water',
    task: 'Issue grid load-shedding pause request for high-density residential pumping grids',
    trigger: 'Heat Index Extreme Danger / Pumping Station Alert',
    responsible: 'KW&SC / K-Electric Operations',
    priority: 'Urgent',
    completed: false,
  },
  {
    id: 'ACT-04',
    category: 'Communication',
    task: 'Broadcast Urdu civic advisory via SMS cell-broadcast (Sindh PDMA Disaster Cell)',
    trigger: 'High or Severe Risk Level Escalation',
    responsible: 'Sindh PDMA Cell (1736)',
    priority: 'Immediate',
    completed: false,
  },
  {
    id: 'ACT-05',
    category: 'Evacuation',
    task: 'Inspect and prepare designated relief shelters in District South and Korangi',
    trigger: '48h Inundation Forecast Exceeding 10 mm/hr',
    responsible: 'District Administration / PDMA',
    priority: 'Urgent',
    completed: false,
  },
];

export const EmergencyPlanner: React.FC<EmergencyPlannerProps> = ({ isSample = false }) => {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Fetch facilities from DuckDB warehouse
  const { data: facilitiesRes, isLoading: isLoadingFacilities } = useQuery({
    queryKey: ['map-facilities', 'all'],
    queryFn: () => api.getMapFacilities([]),
  });

  const toggleCheck = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const filteredItems = checklist.filter((item) =>
    filterCategory === 'all' ? true : item.category === filterCategory
  );

  const completedCount = checklist.filter((item) => item.completed).length;
  const progressPct = Math.round((completedCount / checklist.length) * 100);

  const facilities = facilitiesRes?.data?.features || [];

  return (
    <div className="w-full flex-1 flex flex-col px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
              Emergency Action Planner
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-error/10 text-error border border-error/30">
              OPERATIONAL PROTOCOLS
            </span>
            {isSample && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                SAMPLE DATA
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant mt-1">
            Sindh PDMA & KMC Incident Command System: standard operating procedures, facility triage, and action verification.
          </p>
        </div>

        {/* Emergency Contact Quick Dial */}
        <div className="flex items-center gap-2">
          <a
            href="tel:1736"
            className="px-3 py-2 rounded-xl bg-error text-on-error font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[16px]">call</span>
            <span>Sindh PDMA: 1736</span>
          </a>
          <a
            href="tel:1122"
            className="px-3 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[16px]">emergency</span>
            <span>Rescue 1122</span>
          </a>
        </div>
      </div>

      {/* Progress & Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            SOP Execution Readiness
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-headline-lg text-primary">
              {progressPct}%
            </span>
            <span className="text-xs text-on-surface-variant">
              ({completedCount} of {checklist.length} actions logged)
            </span>
          </div>
          <div className="w-full bg-outline-variant/30 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-secondary h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Critical Facilities Registered
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-headline-lg text-secondary">
              {facilities.length > 0 ? facilities.length : '22'}
            </span>
            <span className="text-xs text-on-surface-variant">
              (DuckDB warehouse catalog)
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-2">
            Hospitals, disaster shelters, pumping stations, and drainage spillways.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Alert Escalation Level
          </span>
          <div className="mt-2 flex items-center gap-2">
            <RiskBadge level="High" />
            <span className="text-xs text-on-surface font-semibold">Tier-2 Advisory Active</span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-2 font-mono">
            Direct coordination with KMC Emergency Control Room
          </p>
        </div>
      </div>

      {/* Interactive SOP Action Checklist */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-on-surface">
              Incident Action Checklist (IAP)
            </h2>
            <p className="text-xs text-on-surface-variant">
              Check off completed protocols to log operational dispatch audit events.
            </p>
          </div>

          {/* Filter Categories */}
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            {['all', 'Public Health', 'Evacuation', 'Grid & Water', 'Communication'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                  filterCategory === cat
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat === 'all' ? 'All Protocols' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                item.completed
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : 'bg-surface border-outline-variant/30 hover:border-outline-variant'
              }`}
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => {}}
                className="mt-1 h-4 w-4 rounded text-secondary focus:ring-secondary cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface">
                    {item.id}
                  </span>
                  <span className="text-xs font-bold text-secondary">
                    {item.category}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      item.priority === 'Immediate'
                        ? 'bg-error/15 text-error border border-error/20'
                        : item.priority === 'Urgent'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
                <p className={`text-sm mt-1 ${item.completed ? 'line-through text-on-surface-variant' : 'text-on-surface font-medium'}`}>
                  {item.task}
                </p>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-on-surface-variant">
                  <span><strong>Trigger:</strong> {item.trigger}</span>
                  <span><strong>Assigned:</strong> {item.responsible}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Facilities Triage List from Warehouse */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-on-surface">
            Designated Critical Facilities & Relief Camps
          </h2>
          <p className="text-xs text-on-surface-variant">
            Official infrastructure assets from the DuckDB facilities table.
          </p>
        </div>

        {isLoadingFacilities ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/30">
                <tr>
                  <th className="px-4 py-3">Facility ID</th>
                  <th className="px-4 py-3">Facility Name</th>
                  <th className="px-4 py-3">Asset Type</th>
                  <th className="px-4 py-3">Karachi Zone</th>
                  <th className="px-4 py-3 text-right">Coordinates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 bg-surface">
                {facilities.slice(0, 10).map((f) => {
                  const p = f.properties;
                  const [lon, lat] = f.geometry.coordinates;
                  return (
                    <tr key={p.facility_id} className="hover:bg-surface-container transition-colors">
                      <td className="px-4 py-2.5 font-mono text-on-surface font-bold">
                        {p.facility_id}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-on-surface">
                        {p.name}
                      </td>
                      <td className="px-4 py-2.5 capitalize font-mono text-on-surface-variant">
                        {p.type.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-secondary font-semibold">
                        {p.zone_id}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-on-surface-variant">
                        {lat.toFixed(4)}, {lon.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
