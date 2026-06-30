import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const supabase = createClient(
  "https://hdnenizzfrzhwmpcvtei.supabase.co",
  "sb_publishable_8_3d7wff0sau_GGUf5qTNQ_BsXpMIiC"
);

const PALETTE = {
  bg: "#FFF8FC", card: "#FFFFFF", border: "#FFE0F0",
  text: "#2C2520", textMid: "#6B5E52", textLight: "#9C8E80",
  accent: "#D4829A", accentSoft: "#FFE8F2", tag: "#FFE8F2", tagText: "#C4889A",
  star: "#F0C8A0", starEmpty: "#FFE0F0", visited: "#BCE0FF", costBg: "#FFD0E4",
  danger: "#E890A8", dangerBg: "#FFF0F4",
  pinVisited: "#7FBFE0", pinWishlist: "#D4829A"
};

const EMPTY_CONFIG = { categories: [], locations: [], costTiers: [] };
function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makePin(color) {
  return L.divIcon({
    className: "custom-pin",
    html: `<div style="background:${color};width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
    iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -24]
  });
}
const pinVisitedIcon = makePin(PALETTE.pinVisited);
const pinWishlistIcon = makePin(PALETTE.pinWishlist);

/* ── Database helpers ── */
async function dbLoadPlaces() {
  const { data, error } = await supabase.from("places").select("*").order("name");
  if (error) { console.error(error); return []; }
  return data.map(r => ({
    id: r.id, name: r.name, categories: r.categories || [], cost: r.cost || "",
    locations: r.locations || [], website: r.website || "", imageUrl: r.image_url || "",
    rating: r.rating || 0, visited: r.visited || false, notes: r.notes || "",
    lat: r.lat ?? null, lng: r.lng ?? null, address: r.address || ""
  }));
}
async function dbLoadConfig() {
  const { data, error } = await supabase.from("config").select("*");
  if (error) { console.error(error); return EMPTY_CONFIG; }
  const config = { ...EMPTY_CONFIG };
  data.forEach(r => { if (r.key in config) config[r.key] = r.value; });
  return config;
}
async function dbUpsertPlace(place) {
  const row = {
    id: place.id, name: place.name, categories: place.categories, cost: place.cost,
    locations: place.locations, website: place.website, image_url: place.imageUrl,
    rating: place.rating, visited: place.visited, notes: place.notes,
    lat: place.lat, lng: place.lng, address: place.address
  };
  const { error } = await supabase.from("places").upsert(row);
  if (error) console.error(error);
}
async function dbDeletePlace(id) {
  const { error } = await supabase.from("places").delete().eq("id", id);
  if (error) console.error(error);
}
async function dbSaveConfig(key, value) {
  const { error } = await supabase.from("config").upsert({ key, value });
  if (error) console.error(error);
}
async function dbClearAllPlaces() {
  const { error } = await supabase.from("places").delete().neq("id", "");
  if (error) console.error(error);
}

/* ── Shared Components ── */
function StarRating({ rating, onRate, size = 18, interactive = false }) {
  return (
    <div style={{ display: "flex", gap: 2, cursor: interactive ? "pointer" : "default" }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onClick={() => interactive && onRate?.(s)}
          style={{ fontSize: size, color: s <= rating ? PALETTE.star : PALETTE.starEmpty, transition: "color .15s" }}>★</span>
      ))}
    </div>
  );
}

function Chip({ label, onRemove, active, onClick, small }) {
  return (
    <span onClick={onClick} style={{
      background: active ? PALETTE.accent : PALETTE.tag,
      color: active ? "#fff" : PALETTE.tagText,
      padding: small ? "2px 8px" : "5px 14px",
      borderRadius: 8, fontSize: small ? 11 : 13,
      fontFamily: "'DM Sans',sans-serif", display: "inline-flex", alignItems: "center", gap: 5,
      cursor: onClick ? "pointer" : "default", fontWeight: active ? 600 : 400,
      transition: "all .15s", whiteSpace: "nowrap", userSelect: "none"
    }}>
      {label}
      {onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", opacity: .7, fontSize: 14, lineHeight: 1 }}>×</span>}
    </span>
  );
}

function MultiSelect({ options, selected, onChange, placeholder, allowCustom, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const toggle = v => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  const typed = search.trim().toLowerCase();
  const canAddCustom = allowCustom && typed.length > 0 && !options.some(o => o.toLowerCase() === typed);
  const addCustom = () => {
    if (!typed) return;
    onAddNew?.(typed);
    if (!selected.includes(typed)) onChange([...selected, typed]);
    setSearch("");
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(!open)} style={{
        border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "8px 12px",
        minHeight: 40, display: "flex", flexWrap: "wrap", gap: 5, cursor: "pointer",
        background: "#fff", alignItems: "center"
      }}>
        {selected.length === 0 && <span style={{ color: PALETTE.textLight, fontSize: 13 }}>{placeholder}</span>}
        {selected.map(s => <Chip key={s} label={s} small onRemove={() => toggle(s)} />)}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: "auto", zIndex: 999, boxShadow: "0 8px 24px rgba(44,37,32,.1)" }}>
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${PALETTE.border}` }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canAddCustom) { e.preventDefault(); addCustom(); } }}
              placeholder={allowCustom ? "Search or type to add..." : "Search..."} autoFocus
              style={{ width: "100%", border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, background: "transparent" }} />
          </div>
          {canAddCustom && (
            <div onClick={addCustom} style={{ padding: "7px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", color: PALETTE.accent, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>＋</span> add "{typed}"
            </div>
          )}
          {filtered.length > 0 ? filtered.map(o => (
            <div key={o} onClick={() => toggle(o)} style={{ padding: "7px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", background: selected.includes(o) ? PALETTE.accentSoft : "transparent", color: PALETTE.text, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${selected.includes(o) ? PALETTE.accent : PALETTE.border}`, background: selected.includes(o) ? PALETTE.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, flexShrink: 0 }}>{selected.includes(o) && "✓"}</span>
              {o}
            </div>
          )) : !canAddCustom && <div style={{ padding: 12, fontSize: 13, color: PALETTE.textLight, textAlign: "center" }}>{options.length === 0 ? "None yet — type to add or use Settings" : "No matches"}</div>}
        </div>
      )}
    </div>
  );
}

/* ── Address Search (Nominatim) ── */
function AddressSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const doSearch = (q) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 3) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=5&countrycodes=us`);
        const data = await res.json();
        setResults(data); setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 400);
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input type="text" value={query}
        onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
        placeholder="Search restaurant or address..."
        style={{ width: "100%", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, outline: "none", background: "#fff", boxSizing: "border-box" }} />
      {loading && <div style={{ fontSize: 11, color: PALETTE.textLight, marginTop: 4 }}>searching...</div>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, marginTop: 4, maxHeight: 220, overflowY: "auto", zIndex: 1001, boxShadow: "0 8px 24px rgba(44,37,32,.12)" }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => {
              const a = r.address || {};
              const town = (a.city || a.town || a.village || a.suburb || a.hamlet || a.municipality || a.county || "").toLowerCase().replace(" county", "");
              onSelect({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.display_name, town });
              setQuery(r.display_name); setOpen(false);
            }} style={{ padding: "8px 12px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", color: PALETTE.text, borderBottom: `1px solid ${PALETTE.border}`, lineHeight: 1.4 }}
              onMouseEnter={e => e.currentTarget.style.background = PALETTE.accentSoft}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              📍 {r.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── City Search (Settings) ── */
function CitySearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const doSearch = (q) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=10&countrycodes=us`);
        const data = await res.json();
        const seen = new Set();
        const cities = [];
        data.forEach(r => {
          const a = r.address || {};
          const name = (a.city || a.town || a.village || a.hamlet || a.municipality || "").toLowerCase();
          const state = a.state || "";
          if (name && !seen.has(name)) { seen.add(name); cities.push({ name, label: `${name}${state ? ", " + state : ""}` }); }
        });
        setResults(cities); setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 400);
  };
  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <input type="text" value={query}
        onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
        placeholder="Search a city..."
        style={{ width: "100%", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, outline: "none", background: "#fff", boxSizing: "border-box" }} />
      {loading && <div style={{ fontSize: 11, color: PALETTE.textLight, marginTop: 4 }}>searching...</div>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, marginTop: 4, maxHeight: 220, overflowY: "auto", zIndex: 1001, boxShadow: "0 8px 24px rgba(44,37,32,.12)" }}>
          {results.map((c, i) => (
            <div key={i} onClick={() => { onSelect(c.name); setQuery(""); setResults([]); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", color: PALETTE.text, borderBottom: `1px solid ${PALETTE.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = PALETTE.accentSoft}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              📍 {c.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Category Detail Modal ── */
function CategoryModal({ category, places, onClose }) {
  const catPlaces = places.filter(p => p.categories?.includes(category));
  const visited = catPlaces.filter(p => p.visited);
  const unvisited = catPlaces.filter(p => !p.visited);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(44,37,32,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PALETTE.bg, borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflowY: "auto", padding: "32px 32px 24px", boxShadow: "0 20px 60px rgba(44,37,32,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🍽</div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, color: PALETTE.text, margin: "0 0 10px" }}>{category}</h2>
            <div style={{ display: "flex", gap: 20 }}>
              <span style={{ fontSize: 14, color: PALETTE.textMid }}>♥ total places: {catPlaces.length}</span>
              <span style={{ fontSize: 14, color: PALETTE.textMid }}>♡ places visited: {visited.length}</span>
            </div>
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", fontSize: 24, color: PALETTE.textLight, lineHeight: 1 }}>×</span>
        </div>
        {visited.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: PALETTE.text, margin: "0 0 12px" }}>places visited</h3>
            <div style={{ overflowX: "auto", background: PALETTE.card, borderRadius: 12, border: `1px solid ${PALETTE.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: `2px solid ${PALETTE.border}` }}>
                  {["place","location","cost","rating","visited?"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: PALETTE.textLight, textTransform: "uppercase", letterSpacing: ".5px", fontFamily: "'DM Sans',sans-serif" }}>{h}</th>)}
                </tr></thead>
                <tbody>{visited.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: PALETTE.text, fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>{p.name}</td>
                    <td style={{ padding: "10px 8px", fontSize: 12, color: PALETTE.textMid, fontFamily: "'DM Sans',sans-serif" }}>{p.locations?.join(", ")}</td>
                    <td style={{ padding: "10px 8px" }}>{p.cost && <span style={{ background: PALETTE.costBg, padding: "2px 8px", borderRadius: 5, fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: PALETTE.textMid }}>{p.cost}</span>}</td>
                    <td style={{ padding: "10px 8px" }}><StarRating rating={p.rating} size={13} /></td>
                    <td style={{ padding: "10px 8px" }}><span style={{ color: PALETTE.visited, fontSize: 16 }}>✔</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {unvisited.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: PALETTE.text, margin: "0 0 12px" }}>want to visit</h3>
            <div style={{ overflowX: "auto", background: PALETTE.card, borderRadius: 12, border: `1px solid ${PALETTE.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: `2px solid ${PALETTE.border}` }}>
                  {["place","location","cost"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: PALETTE.textLight, textTransform: "uppercase", letterSpacing: ".5px", fontFamily: "'DM Sans',sans-serif" }}>{h}</th>)}
                </tr></thead>
                <tbody>{unvisited.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: PALETTE.text, fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>{p.name}</td>
                    <td style={{ padding: "10px 8px", fontSize: 12, color: PALETTE.textMid, fontFamily: "'DM Sans',sans-serif" }}>{p.locations?.join(", ")}</td>
                    <td style={{ padding: "10px 8px" }}>{p.cost && <span style={{ background: PALETTE.costBg, padding: "2px 8px", borderRadius: 5, fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: PALETTE.textMid }}>{p.cost}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {catPlaces.length === 0 && <div style={{ textAlign: "center", padding: 40, color: PALETTE.textLight }}>No places in this category yet.</div>}
      </div>
    </div>
  );
}

/* ── Settings List Manager ── */
function ListManager({ title, items, onUpdate, icon }) {
  const [newItem, setNewItem] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const add = () => { const v = newItem.trim().toLowerCase(); if (v && !items.includes(v)) { onUpdate([...items, v].sort()); setNewItem(""); } };
  const remove = i => onUpdate(items.filter((_, idx) => idx !== i));
  const startEdit = i => { setEditIdx(i); setEditVal(items[i]); };
  const saveEdit = () => { const v = editVal.trim().toLowerCase(); if (v) { const u = [...items]; u[editIdx] = v; onUpdate([...new Set(u)].sort()); } setEditIdx(null); };
  return (
    <div style={{ background: PALETTE.card, borderRadius: 14, border: `1px solid ${PALETTE.border}`, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${PALETTE.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: PALETTE.text, margin: 0 }}>{icon} {title}</h3>
        <span style={{ fontSize: 13, color: PALETTE.textLight }}>{items.length} items</span>
      </div>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${PALETTE.border}`, display: "flex", gap: 8 }}>
        <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder={`Add new ${title.toLowerCase().replace(/s$/, '')}...`}
          style={{ flex: 1, border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, outline: "none", background: "#fff" }} />
        <button onClick={add} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: PALETTE.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Add</button>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "24px 20px", textAlign: "center", color: PALETTE.textLight, fontSize: 13 }}>No {title.toLowerCase()} yet.</div>
      ) : (
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {items.map((item, i) => (
            <div key={item + i} style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${PALETTE.border}`, gap: 8 }}>
              {editIdx === i ? (
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditIdx(null); }} autoFocus
                    style={{ flex: 1, border: `1.5px solid ${PALETTE.accent}`, borderRadius: 8, padding: "5px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, outline: "none" }} />
                  <button onClick={saveEdit} style={{ background: PALETTE.accent, color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>Save</button>
                  <button onClick={() => setEditIdx(null)} style={{ background: "transparent", color: PALETTE.textLight, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>Esc</button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 14, color: PALETTE.text, fontFamily: "'DM Sans',sans-serif" }}>{item}</span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(i)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: PALETTE.textLight, padding: "2px 6px" }}>✏️</button>
                    <button onClick={() => remove(i)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: PALETTE.danger, padding: "2px 6px" }}>🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Locations Manager ── */
function LocationManager({ items, onUpdate }) {
  const add = (city) => { if (city && !items.includes(city)) onUpdate([...items, city].sort()); };
  const remove = i => onUpdate(items.filter((_, idx) => idx !== i));
  return (
    <div style={{ background: PALETTE.card, borderRadius: 14, border: `1px solid ${PALETTE.border}`, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${PALETTE.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: PALETTE.text, margin: 0 }}>📍 Locations</h3>
        <span style={{ fontSize: 13, color: PALETTE.textLight }}>{items.length} cities</span>
      </div>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${PALETTE.border}`, display: "flex", gap: 8 }}>
        <CitySearch onSelect={add} />
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "24px 20px", textAlign: "center", color: PALETTE.textLight, fontSize: 13 }}>No cities yet. Search above to add one!</div>
      ) : (
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {items.map((item, i) => (
            <div key={item + i} style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${PALETTE.border}`, gap: 8 }}>
              <span style={{ fontSize: 14, color: PALETTE.text, fontFamily: "'DM Sans',sans-serif" }}>📍 {item}</span>
              <button onClick={() => remove(i)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: PALETTE.danger, padding: "2px 6px" }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Place Modal ── */
function PlaceModal({ place, config, onSave, onClose, onDelete, onAddLocation }) {
  const isEdit = !!place?.id;
  const [form, setForm] = useState(place || { name: "", categories: [], cost: "", locations: [], website: "", imageUrl: "", rating: 0, visited: false, notes: "", lat: null, lng: null, address: "" });
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const label = { fontSize: 12, fontWeight: 600, color: PALETTE.textMid, marginBottom: 5, display: "block", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".5px" };
  const input = { width: "100%", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, outline: "none", background: "#fff", boxSizing: "border-box" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(44,37,32,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PALETTE.bg, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", padding: "28px 28px 20px", boxShadow: "0 20px 60px rgba(44,37,32,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: PALETTE.text, margin: 0 }}>{isEdit ? "Edit Place" : "Add New Place"}</h2>
          <span onClick={onClose} style={{ cursor: "pointer", fontSize: 22, color: PALETTE.textLight, lineHeight: 1 }}>×</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><label style={label}>Name *</label><input style={input} value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Dave's Hot Chicken" /></div>
          <div>
            <label style={label}>Find on map {form.lat && <span style={{ fontWeight: 400, textTransform: "none", color: PALETTE.visited }}>✓ pinned</span>}</label>
            <AddressSearch value={form.address} onSelect={({ lat, lng, address, town }) => {
              if (town) onAddLocation(town);
              setForm(f => ({ ...f, lat, lng, address, locations: town && !f.locations.includes(town) ? [...f.locations, town] : f.locations }));
            }} />
          </div>
          <div>
            <label style={label}>Categories {config.categories.length === 0 && <span style={{ fontWeight: 400, textTransform: "none", color: PALETTE.textLight }}>(add in Settings)</span>}</label>
            <MultiSelect options={config.categories} selected={form.categories} onChange={v => update("categories", v)} placeholder="Select categories..." />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>Cost</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {config.costTiers.length > 0 ? config.costTiers.map(c => (
                  <span key={c} onClick={() => update("cost", form.cost === c ? "" : c)}
                    style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", background: form.cost === c ? PALETTE.accent : PALETTE.costBg, color: form.cost === c ? "#fff" : PALETTE.textMid, fontWeight: form.cost === c ? 600 : 400, transition: "all .15s" }}>{c}</span>
                )) : <span style={{ fontSize: 12, color: PALETTE.textLight }}>—</span>}
              </div>
            </div>
            <div><label style={label}>Rating</label><StarRating rating={form.rating} onRate={r => update("rating", r)} size={22} interactive /></div>
          </div>
          <div>
            <label style={label}>Locations {config.locations.length === 0 && <span style={{ fontWeight: 400, textTransform: "none", color: PALETTE.textLight }}>(add in Settings)</span>}</label>
            <MultiSelect options={config.locations} selected={form.locations} onChange={v => update("locations", v)} placeholder="Select or type locations..." allowCustom onAddNew={loc => onAddLocation(loc)} />
          </div>
          <div><label style={label}>Website</label><input style={input} value={form.website} onChange={e => update("website", e.target.value)} placeholder="https://..." /></div>
          <div><label style={label}>Image URL</label><input style={input} value={form.imageUrl} onChange={e => update("imageUrl", e.target.value)} placeholder="Paste an image link..." /></div>
          <div><label style={label}>Notes</label><textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Any notes..." /></div>
          <div onClick={() => update("visited", !form.visited)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 0" }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${form.visited ? PALETTE.visited : PALETTE.border}`, background: form.visited ? PALETTE.visited : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, transition: "all .15s" }}>{form.visited && "✓"}</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: PALETTE.text }}>Visited</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "space-between" }}>
          <div>{isEdit && <button onClick={() => { if (confirm("Delete this place?")) onDelete(place.id); }} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: PALETTE.dangerBg, color: PALETTE.danger, fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Delete</button>}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${PALETTE.border}`, background: "transparent", color: PALETTE.textMid, fontFamily: "'DM Sans',sans-serif", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { if (!form.name.trim()) return; onSave({ ...form, id: form.id || gid() }); }}
              style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: PALETTE.accent, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{isEdit ? "Save" : "Add Place"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Place Card ── */
function PlaceCard({ place, onClick, distance }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={() => onClick(place)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: PALETTE.card, borderRadius: 14, overflow: "hidden", cursor: "pointer", border: `1px solid ${PALETTE.border}`, transition: "transform .2s, box-shadow .2s", transform: hov ? "translateY(-3px)" : "none", boxShadow: hov ? "0 12px 32px rgba(44,37,32,.12)" : "0 2px 8px rgba(44,37,32,.04)" }}>
      {place.imageUrl ? (
        <div style={{ width: "100%", height: 140, background: `url(${place.imageUrl}) center/cover`, backgroundColor: PALETTE.accentSoft }} />
      ) : (
        <div style={{ width: "100%", height: 70, background: `linear-gradient(135deg, ${PALETTE.accentSoft}, ${PALETTE.tag})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🍽</div>
      )}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          {place.visited && <span style={{ color: PALETTE.visited, fontSize: 14 }}>✔</span>}
          <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: PALETTE.text, margin: 0, lineHeight: 1.3 }}>{place.name}</h3>
        </div>
        {typeof distance === "number" && (
          <div style={{ fontSize: 11, color: PALETTE.accent, fontWeight: 600, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>
            📍 {distance < 0.1 ? "< 0.1" : distance.toFixed(1)} mi away
          </div>
        )}
        {place.categories?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {place.categories.map(c => <Chip key={c} label={c} small />)}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {place.cost && <span style={{ background: PALETTE.costBg, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontFamily: "'DM Sans',sans-serif", color: PALETTE.textMid, fontWeight: 500 }}>{place.cost}</span>}
          {place.rating > 0 && <StarRating rating={place.rating} size={12} />}
        </div>
        {place.locations?.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {place.locations.map(l => <span key={l} style={{ fontSize: 11, color: PALETTE.textLight, fontFamily: "'DM Sans',sans-serif" }}>📍 {l}</span>)}
          </div>
        )}
        {place.website && (
          <a href={place.website.startsWith("http") ? place.website : `https://${place.website}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ display: "block", marginTop: 5, fontSize: 11, color: PALETTE.accent, fontFamily: "'DM Sans',sans-serif", textDecoration: "none" }}>
            {place.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Map View ── */
function MapView({ places, onClick, userLoc }) {
  const pinned = places.filter(p => p.lat && p.lng);
  const center = userLoc ? [userLoc.lat, userLoc.lng] : pinned.length > 0 ? [pinned[0].lat, pinned[0].lng] : [38.8816, -77.0910];
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${PALETTE.border}`, height: 560 }}>
      {pinned.length === 0 ? (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: PALETTE.accentSoft, color: PALETTE.textMid }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
          <div style={{ fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>No pinned places yet. Use "Find on map" when adding a place!</div>
        </div>
      ) : (
        <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {userLoc && (
            <Marker position={[userLoc.lat, userLoc.lng]} icon={L.divIcon({ className: "me-pin", html: `<div style="background:#4A90D9;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(74,144,217,.3)"></div>`, iconSize: [18,18], iconAnchor: [9,9] })}>
              <Popup>You are here</Popup>
            </Marker>
          )}
          {pinned.map(p => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={p.visited ? pinVisitedIcon : pinWishlistIcon}>
              <Popup>
                <div style={{ fontFamily: "'DM Sans',sans-serif", minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: PALETTE.text, marginBottom: 4 }}>{p.name}</div>
                  {p.categories?.length > 0 && <div style={{ fontSize: 11, color: PALETTE.tagText, marginBottom: 4 }}>{p.categories.join(", ")}</div>}
                  {p.rating > 0 && <div style={{ color: PALETTE.star, fontSize: 13 }}>{"★".repeat(p.rating)}</div>}
                  {p.cost && <div style={{ fontSize: 12, color: PALETTE.textMid, marginTop: 2 }}>{p.cost}</div>}
                  <div style={{ fontSize: 11, color: p.visited ? PALETTE.pinVisited : PALETTE.pinWishlist, marginTop: 2, fontWeight: 600 }}>{p.visited ? "✓ visited" : "want to visit"}</div>
                  <button onClick={() => onClick(p)} style={{ marginTop: 6, padding: "4px 10px", borderRadius: 6, border: "none", background: PALETTE.accent, color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>edit</button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const [places, setPlaces] = useState([]);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [viewTab, setViewTab] = useState("overview");
  const [activeCats, setActiveCats] = useState([]);
  const [activeLocs, setActiveLocs] = useState([]);
  const [search, setSearch] = useState("");
  const [placeModal, setPlaceModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [page, setPage] = useState("main");
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState(null);
  const [nearMe, setNearMe] = useState(false);
  const [locStatus, setLocStatus] = useState("");
  const [surprise, setSurprise] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([dbLoadPlaces(), dbLoadConfig()]);
      setPlaces(p); setConfig(c); setLoading(false);
    })();
  }, []);

  const handleSavePlace = async (place) => {
    await dbUpsertPlace(place);
    const exists = places.find(p => p.id === place.id);
    setPlaces(exists ? places.map(p => p.id === place.id ? place : p) : [...places, place]);
    setPlaceModal(null);
  };
  const handleDeletePlace = async (pid) => { await dbDeletePlace(pid); setPlaces(places.filter(p => p.id !== pid)); setPlaceModal(null); };
  const handleConfigUpdate = async (key, value, fullConfig) => { await dbSaveConfig(key, value); setConfig(fullConfig); };
  const handleClearAll = async () => { await dbClearAllPlaces(); setPlaces([]); };
  const handleAddLocation = async (loc) => {
    if (!loc) return;
    setConfig(prev => {
      if (prev.locations.includes(loc)) return prev;
      const updated = [...prev.locations, loc].sort();
      dbSaveConfig("locations", updated);
      return { ...prev, locations: updated };
    });
  };

  const requestLocation = () => {
    if (!navigator.geolocation) { setLocStatus("Location not supported on this device"); return; }
    setLocStatus("getting your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMe(true);
        setViewTab("overview");
        setLocStatus("");
      },
      () => { setLocStatus("couldn't get location — check browser permissions"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleCat = c => setActiveCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  const toggleLoc = l => setActiveLocs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const withDistance = (p) => (nearMe && userLoc && p.lat && p.lng)
    ? distanceMiles(userLoc.lat, userLoc.lng, p.lat, p.lng) : undefined;

  let filtered = places
    .filter(p => {
      if (activeCats.length > 0 && !activeCats.some(c => p.categories?.includes(c))) return false;
      if (activeLocs.length > 0 && !activeLocs.some(l => p.locations?.includes(l))) return false;
      if (viewTab === "want to visit" && p.visited) return false;
      if (viewTab === "view by rating" && !p.rating) return false;
      if (search) { const q = search.toLowerCase(); return p.name.toLowerCase().includes(q) || p.categories?.some(c => c.includes(q)) || p.locations?.some(l => l.includes(q)); }
      return true;
    })
    .sort((a, b) => {
      if (nearMe && userLoc) {
        const da = withDistance(a), db = withDistance(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      }
      if (viewTab === "view by rating") return (b.rating || 0) - (a.rating || 0);
      if (viewTab === "view by cost") { const idx = t => config.costTiers.indexOf(t); return (idx(a.cost) === -1 ? 99 : idx(a.cost)) - (idx(b.cost) === -1 ? 99 : idx(b.cost)); }
      return a.name.localeCompare(b.name);
    });

  const isEmpty = config.categories.length === 0 && config.locations.length === 0 && places.length === 0;
  const visitedCount = places.filter(p => p.visited).length;

  const pickSurprise = () => {
    const pool = places.filter(p => !p.visited);
    if (pool.length === 0) { setSurprise({ none: true }); return; }
    setSurprise(pool[Math.floor(Math.random() * pool.length)]);
  };

  const tabBtn = (label, value) => (
    <button key={value} onClick={() => { setViewTab(value); }} style={{
      padding: "6px 16px", borderRadius: 8, border: "none",
      background: viewTab === value ? PALETTE.accent : "transparent",
      color: viewTab === value ? "#fff" : PALETTE.textMid,
      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      transition: "all .15s", whiteSpace: "nowrap"
    }}>{label}</button>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: PALETTE.bg }}>
      <span style={{ fontFamily: "'DM Sans',sans-serif", color: PALETTE.textLight, fontSize: 16 }}>loading your places...</span>
    </div>
  );

  if (page === "settings") {
    return (
      <div style={{ background: PALETTE.bg, minHeight: "100vh", fontFamily: "'DM Sans',sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
        <div style={{ maxWidth: 800, margin: "0 auto", padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => setPage("main")} style={{ background: "transparent", border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: PALETTE.textMid }}>← Back</button>
            <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, color: PALETTE.text, margin: 0 }}>⚙️ Settings</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ListManager title="Categories" icon="📂" items={config.categories} onUpdate={cats => handleConfigUpdate("categories", cats, { ...config, categories: cats })} />
            <LocationManager items={config.locations} onUpdate={locs => handleConfigUpdate("locations", locs, { ...config, locations: locs })} />
            <ListManager title="Cost Tiers" icon="💰" items={config.costTiers} onUpdate={tiers => handleConfigUpdate("costTiers", tiers, { ...config, costTiers: tiers })} />
            {places.length > 0 && (
              <div style={{ background: PALETTE.dangerBg, borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: PALETTE.danger, margin: "0 0 12px" }}>⚠️ Danger Zone</h3>
                <button onClick={() => { if (confirm("Delete ALL places?")) handleClearAll(); }}
                  style={{ padding: "10px 18px", borderRadius: 10, border: `1.5px solid ${PALETTE.danger}`, background: "transparent", color: PALETTE.danger, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear All Places</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: PALETTE.bg, minHeight: "100vh", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
      <div style={{ padding: "24px 28px 0", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, color: PALETTE.text, margin: "0 0 2px", letterSpacing: "-.5px" }}>dmv+ tracker</h1>
            <p style={{ color: PALETTE.textLight, fontSize: 13, margin: 0 }}>{places.length} places · {visitedCount} visited{places.length > 0 ? ` · ${Math.round(visitedCount / places.length * 100)}% explored` : ""}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={pickSurprise} style={{ padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${PALETTE.border}`, background: "transparent", color: PALETTE.textMid, fontFamily: "'DM Sans',sans-serif", fontSize: 13, cursor: "pointer" }}>🎲 surprise me</button>
            <button onClick={() => setPage("settings")} style={{ padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${PALETTE.border}`, background: "transparent", color: PALETTE.textMid, fontFamily: "'DM Sans',sans-serif", fontSize: 13, cursor: "pointer" }}>⚙️ Settings</button>
            <button onClick={() => setPlaceModal({})} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: PALETTE.accent, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,130,154,.25)" }}>+ Add Place</button>
          </div>
        </div>
        {config.categories.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: PALETTE.textLight, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 }}>cuisine / type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {config.categories.map(cat => (
                <Chip key={cat} label={`🍽 ${cat}`} active={activeCats.includes(cat)} onClick={() => setCatModal(cat)} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 28px 40px", display: "flex", gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEmpty ? (
            <div style={{ background: `linear-gradient(135deg, ${PALETTE.accentSoft}, ${PALETTE.tag})`, borderRadius: 16, padding: "40px 28px", textAlign: "center", border: `1px solid ${PALETTE.border}` }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🍽</div>
              <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, color: PALETTE.text, margin: "0 0 8px" }}>Welcome!</h2>
              <p style={{ fontSize: 14, color: PALETTE.textMid, margin: "0 0 20px" }}>Set up your categories, locations, and cost tiers first.</p>
              <button onClick={() => setPage("settings")} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: PALETTE.accent, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Go to Settings →</button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: PALETTE.text, margin: "0 0 10px" }}>cafe + restaurant tracker</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4, background: PALETTE.card, borderRadius: 10, border: `1.5px solid ${PALETTE.border}`, padding: 3, flexWrap: "wrap" }}>
                    {tabBtn("⊞ overview", "overview")}
                    {tabBtn("★ rating", "view by rating")}
                    {tabBtn("💰 cost", "view by cost")}
                    {tabBtn("📍 want to visit", "want to visit")}
                    {tabBtn("🗺️ map", "map")}
                  </div>
                  <button onClick={nearMe ? () => { setNearMe(false); setUserLoc(null); } : requestLocation}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: nearMe ? PALETTE.pinVisited : PALETTE.accentSoft, color: nearMe ? "#fff" : PALETTE.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    {nearMe ? "✓ near me" : "📍 near me"}
                  </button>
                  {viewTab !== "map" && <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 search..."
                    style={{ border: `1.5px solid ${PALETTE.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: PALETTE.text, outline: "none", background: "#fff", width: 160 }} />}
                </div>
                {locStatus && <div style={{ fontSize: 12, color: PALETTE.textMid, marginTop: 8 }}>{locStatus}</div>}
                {nearMe && !locStatus && <div style={{ fontSize: 12, color: PALETTE.accent, marginTop: 8, fontWeight: 600 }}>showing places nearest to you · pinned places only have distances</div>}
              </div>
              {(activeCats.length > 0 || activeLocs.length > 0) && viewTab !== "map" && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: PALETTE.textLight }}>Filtering:</span>
                  {activeCats.map(c => <Chip key={c} label={c} small active onRemove={() => toggleCat(c)} />)}
                  {activeLocs.map(l => <Chip key={l} label={`📍 ${l}`} small active onRemove={() => toggleLoc(l)} />)}
                </div>
              )}
              {viewTab === "map" ? (
                <MapView places={places} onClick={p => setPlaceModal(p)} userLoc={userLoc} />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                  {filtered.map(p => <PlaceCard key={p.id} place={p} onClick={() => setPlaceModal(p)} distance={withDistance(p)} />)}
                  {filtered.length === 0 && (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 50, color: PALETTE.textLight }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>{places.length === 0 ? "🍜" : "🔍"}</div>
                      <div style={{ fontSize: 14 }}>{places.length === 0 ? "No places yet." : "No matches."}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {config.locations.length > 0 && !isEmpty && viewTab !== "map" && (
          <div style={{ width: 200, flexShrink: 0 }}>
            <div style={{ position: "sticky", top: 20 }}>
              <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: PALETTE.text, margin: "0 0 10px" }}>locations</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {config.locations.map(loc => {
                  const isActive = activeLocs.includes(loc);
                  const count = places.filter(p => p.locations?.includes(loc)).length;
                  return (
                    <div key={loc} onClick={() => toggleLoc(loc)} style={{ padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: isActive ? PALETTE.accentSoft : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all .15s" }}>
                      <span style={{ fontSize: 13, color: isActive ? PALETTE.accent : PALETTE.text, fontWeight: isActive ? 600 : 400, fontFamily: "'DM Sans',sans-serif" }}>📍 {loc}</span>
                      {count > 0 && <span style={{ fontSize: 11, color: PALETTE.textLight }}>{count}</span>}
                    </div>
                  );
                })}
              </div>
              {activeLocs.length > 0 && <span onClick={() => setActiveLocs([])} style={{ fontSize: 12, color: PALETTE.danger, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "block", marginTop: 8 }}>clear locations</span>}
            </div>
          </div>
        )}
      </div>
      {placeModal !== null && <PlaceModal place={placeModal.id ? placeModal : null} config={config} onSave={handleSavePlace} onClose={() => setPlaceModal(null)} onDelete={handleDeletePlace} onAddLocation={handleAddLocation} />}
      {catModal && <CategoryModal category={catModal} places={places} onClose={() => setCatModal(null)} />}
      {surprise && (
        <div onClick={() => setSurprise(null)} style={{ position: "fixed", inset: 0, background: "rgba(44,37,32,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PALETTE.bg, borderRadius: 16, width: "100%", maxWidth: 380, padding: 28, textAlign: "center", boxShadow: "0 20px 60px rgba(44,37,32,.2)" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎲</div>
            {surprise.none ? (
              <p style={{ fontFamily: "'DM Sans',sans-serif", color: PALETTE.textMid }}>You've visited everywhere! Add more places to your wishlist.</p>
            ) : (
              <>
                <div style={{ fontSize: 12, color: PALETTE.textLight, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>tonight, try...</div>
                <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, color: PALETTE.text, margin: "0 0 10px" }}>{surprise.name}</h2>
                {surprise.categories?.length > 0 && <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>{surprise.categories.map(c => <Chip key={c} label={c} small />)}</div>}
                {surprise.locations?.length > 0 && <div style={{ fontSize: 13, color: PALETTE.textMid, marginBottom: 6 }}>📍 {surprise.locations.join(", ")}</div>}
                {surprise.cost && <div style={{ fontSize: 13, color: PALETTE.textMid }}>{surprise.cost}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "center" }}>
                  <button onClick={pickSurprise} style={{ padding: "9px 18px", borderRadius: 10, border: `1.5px solid ${PALETTE.border}`, background: "transparent", color: PALETTE.textMid, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>🎲 again</button>
                  <button onClick={() => { setPlaceModal(surprise); setSurprise(null); }} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: PALETTE.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>view</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
