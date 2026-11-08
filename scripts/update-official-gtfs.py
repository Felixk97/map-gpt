#!/usr/bin/env python3
"""Download official Malaysia GTFS ZIPs and generate a lightweight map overlay.
Run locally or in GitHub Actions. Requires Python standard library only.
"""
import csv, io, json, os, sys, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

FEEDS = {
    "ktmb": "https://api.data.gov.my/gtfs-static/ktmb",
    "rapid-rail-kl": "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl",
    "rapid-bus-kl": "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl",
    "rapid-bus-mrtfeeder": "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder",
    "rapid-bus-penang": "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-penang",
}
def rows(z, name):
    matches = [x for x in z.namelist() if x.rsplit("/",1)[-1].lower() == name]
    if not matches: return []
    with z.open(matches[0]) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline="")))
def coord(lat,lon):
    try:
        a,b=float(lat),float(lon)
        return [round(b,6),round(a,6)] if 0<a<9 and 98<b<120 else None
    except (ValueError,TypeError): return None
def make_feed(name,url):
    req=urllib.request.Request(url,headers={"User-Agent":"LapanMalaysiaGTFS/1.0","Accept":"application/zip"})
    with urllib.request.urlopen(req,timeout=90) as response:
        content=response.read(90_000_001)
    if len(content)>90_000_000: raise ValueError("GTFS feed exceeds 90 MB safety limit")
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        stops=rows(z,"stops.txt")
        routes=rows(z,"routes.txt")
        trips=rows(z,"trips.txt")
        times=rows(z,"stop_times.txt")
        shapes=rows(z,"shapes.txt")
        station_map={}
        for s in stops:
            xy=coord(s.get("stop_lat"),s.get("stop_lon"))
            if xy and s.get("stop_id"):
                station_map[s["stop_id"]]={"name":s.get("stop_name",""),"coordinates":xy,"parent":s.get("parent_station","")}
        # Parent stops may be missing coordinates; children remain searchable.
        stations=[]
        seen=set()
        for sid,s in station_map.items():
            key=(s["name"].casefold(),tuple(s["coordinates"]))
            if key not in seen and s["name"]:
                stations.append({"id":name+":"+sid,"name":s["name"],"coordinates":s["coordinates"],"feed":name})
                seen.add(key)
        route_map={r["route_id"]:r for r in routes if r.get("route_id")}
        trip_route={t["trip_id"]:t.get("route_id") for t in trips if t.get("trip_id")}
        shape_route={}
        for t in trips:
            if t.get("shape_id") and t.get("route_id"):
                shape_route.setdefault(t["shape_id"],t["route_id"])
        by_shape={}
        for s in shapes:
            xy=coord(s.get("shape_pt_lat"),s.get("shape_pt_lon"))
            if xy and s.get("shape_id"):
                try: seq=int(s.get("shape_pt_sequence","0"))
                except ValueError: seq=0
                by_shape.setdefault(s["shape_id"],[]).append((seq,xy))
        lines=[]
        if by_shape:
            # Keep one representative full shape per route, not every trip duplication.
            representative={}
            for sid,points in by_shape.items():
                rid=shape_route.get(sid)
                if rid and len(points)>len(representative.get(rid,[])):
                    representative[rid]=points
            for rid,points in representative.items():
                route=route_map.get(rid,{})
                points.sort(key=lambda x:x[0])
                xy=[p[1] for p in points]
                # Limit overlay size for mobile; retain endpoints.
                if len(xy)>1800: xy=xy[::max(1,len(xy)//1800)]+[xy[-1]]
                if len(xy)>1:
                    lines.append({"id":name+":"+rid,"name":route.get("route_long_name") or route.get("route_short_name") or rid,
                        "color":route.get("route_color") or "2176AE","coordinates":xy,"feed":name,"geometrySource":"gtfs-shapes"})
        else:
            # Fallback: one representative trip per route from stop_times.
            representative={}
            for t in trips:
                rid=t.get("route_id")
                if rid and rid not in representative: representative[rid]=t["trip_id"]
            wanted=set(representative.values())
            trip_points={}
            for t in times:
                if t.get("trip_id") in wanted and t.get("stop_id") in station_map:
                    try: seq=int(t.get("stop_sequence","0"))
                    except ValueError: seq=0
                    trip_points.setdefault(t["trip_id"],[]).append((seq,station_map[t["stop_id"]]["coordinates"]))
            for rid,tid in representative.items():
                points=sorted(trip_points.get(tid,[]))
                if len(points)>1:
                    route=route_map.get(rid,{})
                    lines.append({"id":name+":"+rid,"name":route.get("route_long_name") or route.get("route_short_name") or rid,
                        "color":route.get("route_color") or "2176AE","coordinates":[p[1] for p in points],
                        "feed":name,"geometrySource":"straight-between-stops"})
        return {"stations":stations,"lines":lines,"countTrips":len(trips),"countStops":len(stops)}
def main():
    feeds={}
    for name,url in FEEDS.items():
        try:
            print("Fetching",name,flush=True)
            feeds[name]=make_feed(name,url)
            print("  stations:",len(feeds[name]["stations"]),"lines:",len(feeds[name]["lines"]),flush=True)
        except Exception as e:
            print("FAILED:",name,str(e),file=sys.stderr,flush=True)
    if not feeds: raise SystemExit("No official GTFS feeds downloaded; existing map data was not replaced.")
    output={"source":"Malaysia official GTFS Static (data.gov.my)","license":"CC BY 4.0",
        "attribution":"GTFS data: KTMB, Prasarana via Malaysia's Official Open API (data.gov.my), CC BY 4.0",
        "generatedAt":datetime.now(timezone.utc).isoformat(),"feeds":feeds,
        "warnings":["Lines marked straight-between-stops are schematic, not actual track or road geometry.",
                    "Static GTFS is schedule data; this file does not contain live vehicle locations or fares."]}
    target=Path(__file__).resolve().parents[1]/"data"/"official-gtfs-map.json"
    target.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("Saved",target,round(target.stat().st_size/1024),"KB")
if __name__=="__main__": main()
