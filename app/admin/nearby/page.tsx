"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Navigation, MapPin, Phone, Mail, Users, Search, Locate } from "lucide-react";

interface NearbyMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  district: string;
  distance: number;
  location_updated_at: string;
}

export default function NearbyMembersPage() {
  const [nearby, setNearby] = useState<NearbyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState("25");
  const [searchLat, setSearchLat] = useState("");
  const [searchLng, setSearchLng] = useState("");
  const [searched, setSearched] = useState(false);

  async function findFromMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setSearchLat(pos.coords.latitude.toFixed(6));
        setSearchLng(pos.coords.longitude.toFixed(6));
        await fetchNearby(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        toast.error("Location permission denied");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function fetchNearby(lat: number, lng: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/location?lat=${lat}&lng=${lng}&radius=${radius}`);
      const data = await res.json();
      if (res.ok) {
        setNearby(data.nearby || []);
        setSearched(true);
        if (data.nearby.length === 0) {
          toast.info("No members found within " + radius + " km");
        }
      } else {
        toast.error(data.error || "Failed to search");
      }
    } catch {
      toast.error("Failed to search");
    } finally {
      setLoading(false);
    }
  }

  async function searchByCoords() {
    const lat = parseFloat(searchLat);
    const lng = parseFloat(searchLng);
    if (!lat || !lng) {
      toast.error("Enter valid coordinates");
      return;
    }
    await fetchNearby(lat, lng);
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <Navigation className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Nearby Members</h1>
          <p className="text-sm text-muted-foreground">Find members with location sharing enabled near a location</p>
        </div>
      </div>

      {/* Search Options */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={findFromMyLocation} disabled={loading} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Locate size={16} />
              {loading ? "Searching..." : "Find Near My Location"}
            </Button>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Radius (km):</Label>
              <Input
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-20"
                min="1"
                max="500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>or search by coordinates:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Label className="text-xs w-8">Lat:</Label>
              <Input placeholder="e.g. 11.0168" value={searchLat} onChange={(e) => setSearchLat(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Label className="text-xs w-8">Lng:</Label>
              <Input placeholder="e.g. 76.9558" value={searchLng} onChange={(e) => setSearchLng(e.target.value)} />
            </div>
            <Button variant="outline" onClick={searchByCoords} disabled={loading} className="gap-2">
              <Search size={14} /> Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {searched && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">{nearby.length} member(s) within {radius} km</span>
          </div>

          {nearby.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground py-12">
                <Navigation className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p>No members found nearby. Members need to enable location sharing in their Profile.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {nearby.map((m) => (
                <Card key={m.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{m.name}</p>
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                            {m.distance} km
                          </Badge>
                          {m.district && (
                            <Badge variant="outline" className="text-[10px]">
                              {m.district}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {m.phone && (
                            <a href={`tel:${m.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                              <Phone size={10} /> {m.phone}
                            </a>
                          )}
                          {m.email && (
                            <span className="flex items-center gap-1">
                              <Mail size={10} /> {m.email}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin size={10} /> {timeAgo(m.location_updated_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
