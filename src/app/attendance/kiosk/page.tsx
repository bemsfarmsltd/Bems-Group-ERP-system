'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Clock,
  ShieldCheck,
  RefreshCw,
  Maximize2,
  Minimize2,
  Wifi,
  Zap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Radio,
  Search,
  X,
  UserCheck,
  Users,
  Download,
  MapPin,
  Lock,
  Laptop,
  Check,
} from 'lucide-react';

interface StationData {
  stationId?: string;
  stationCode: string;
  stationName: string;
  stateLocation?: string | null;
  organizationName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  starlinkOverrideMode?: string;
  calibratedRouterIp?: string | null;
  detectedRouterIp?: string | null;
  requiresCalibration?: boolean;
  qrToken: string;
  qrDataUrl?: string;
  qrSvg?: string;
  expiresInSeconds: number;
  powerOutageMode?: boolean;
  requireStarlinkIp?: boolean;
  requireGeofence?: boolean;
  earliestCheckInTime?: string;
  resumptionTime?: string;
  closingTime?: string;
  gracePeriodMinutes?: number;
  latenessDeductionPercent?: number;
  stations?: Array<{
    id: string;
    code: string;
    name: string;
    stateLocation?: string | null;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    starlinkOverrideMode?: string;
  }>;
}

export default function AttendanceKioskPage() {
  const [stationData, setStationData] = useState<StationData | null>(null);
  const [selectedStationCode, setSelectedStationCode] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(45);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requiresActivation, setRequiresActivation] = useState<boolean>(false);
  const [availableStations, setAvailableStations] = useState<
    Array<{ code: string; name: string; stateLocation?: string | null }>
  >([]);
  const [activationPassword, setActivationPassword] = useState<string>('');
  const [activatingStation, setActivatingStation] = useState<boolean>(false);

  // One-Time Location & Router Calibration Modal State
  const [calCoords, setCalCoords] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [calRadius, setCalRadius] = useState<number>(100);
  const [calibratingGps, setCalibratingGps] = useState<boolean>(false);
  const [savingCalibration, setSavingCalibration] = useState<boolean>(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isQrOnlyFullscreen, setIsQrOnlyFullscreen] = useState<boolean>(false);
  const [recentPunches, setRecentPunches] = useState<any[]>([]);
  const [totalPresentCount, setTotalPresentCount] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSyncingRecent, setIsSyncingRecent] = useState<boolean>(false);

  // PWA Desktop App Installation
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Offline Staff PIN Check-In Modal
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [staffIdentifier, setStaffIdentifier] = useState<string>('');
  const [kioskPin, setKioskPin] = useState<string>('');
  const [pinAction, setPinAction] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [pinBusy, setPinBusy] = useState<boolean>(false);
  const [pinResult, setPinResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Real-time Big-Photo Welcome / Goodbye Celebration Modal
  const [celebrationCard, setCelebrationCard] = useState<{
    action: 'CHECK_IN' | 'CHECK_OUT';
    employeeId: string;
    legalName: string;
    employeeNumber: string;
    avatarUrl?: string | null;
    department?: string;
    subsidiary?: string;
    stationName?: string;
    status?: string;
    timeStr: string;
  } | null>(null);
  const seenPunchesRef = useRef<Map<string, { checkIn?: string; checkOut?: string }>>(new Map());
  const baselineStationRef = useRef<string | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCelebration = useCallback(
    (payload: {
      action: 'CHECK_IN' | 'CHECK_OUT';
      employeeId: string;
      legalName: string;
      employeeNumber: string;
      avatarUrl?: string | null;
      department?: string;
      subsidiary?: string;
      stationName?: string;
      status?: string;
      timeStr: string;
    }) => {
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      setCelebrationCard(payload);
      celebrationTimerRef.current = setTimeout(() => {
        setCelebrationCard(null);
      }, 7500);
    },
    []
  );

  // Poll recent arrivals & all staff who marked attendance today at this Kiosk Location (cache-busted)
  const fetchRecent = useCallback(
    async (overrideStationCode?: string | React.MouseEvent, resetBaseline = false) => {
      setIsSyncingRecent(true);
      try {
        let codeToUse =
          typeof overrideStationCode === 'string'
            ? overrideStationCode
            : selectedStationCode || stationData?.stationCode || '';
        if (!codeToUse && typeof window !== 'undefined') {
          codeToUse =
            new URLSearchParams(window.location.search).get('station') ||
            localStorage.getItem('bems_kiosk_station_code') ||
            '';
        }
        const stationParam = codeToUse ? `&stationCode=${encodeURIComponent(codeToUse)}` : '';
        const res = await fetch(`/api/attendance/timesheet?kiosk=true${stationParam}&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          const activeToday = (data.employees || []).filter((e: any) => Boolean(e.checkInTime));
          const stationKey = codeToUse || 'DEFAULT';
          const isInitialForStation = resetBaseline || baselineStationRef.current !== stationKey;

          if (isInitialForStation) {
            const nextMap = new Map<string, { checkIn?: string; checkOut?: string }>();
            for (const emp of activeToday) {
              nextMap.set(emp.employeeId, {
                checkIn: emp.checkInTime ? String(emp.checkInTime) : undefined,
                checkOut: emp.checkOutTime ? String(emp.checkOutTime) : undefined,
              });
            }
            seenPunchesRef.current = nextMap;
            baselineStationRef.current = stationKey;
          } else {
            // Detect any newly arrived check-in or check-out at this kiosk location (e.g. Mobile QR Scan)
            for (const emp of activeToday) {
              const prev = seenPunchesRef.current.get(emp.employeeId);
              const currIn = emp.checkInTime ? String(emp.checkInTime) : undefined;
              const currOut = emp.checkOutTime ? String(emp.checkOutTime) : undefined;

              if (currOut && (!prev || prev.checkOut !== currOut)) {
                const outFormatted = new Date(currOut).toLocaleTimeString('en-US', {
                  timeZone: 'Africa/Lagos',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                });
                triggerCelebration({
                  action: 'CHECK_OUT',
                  employeeId: emp.employeeId,
                  legalName: emp.legalName,
                  employeeNumber: emp.employeeNumber,
                  avatarUrl: emp.avatarUrl,
                  department: emp.department,
                  subsidiary: emp.subsidiary,
                  stationName: emp.stationName || stationData?.stationName || 'BEMS Attendance Kiosk',
                  status: emp.status,
                  timeStr: outFormatted,
                });
              } else if (currIn && (!prev || prev.checkIn !== currIn)) {
                const inFormatted = new Date(currIn).toLocaleTimeString('en-US', {
                  timeZone: 'Africa/Lagos',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                });
                triggerCelebration({
                  action: 'CHECK_IN',
                  employeeId: emp.employeeId,
                  legalName: emp.legalName,
                  employeeNumber: emp.employeeNumber,
                  avatarUrl: emp.avatarUrl,
                  department: emp.department,
                  subsidiary: emp.subsidiary,
                  stationName: emp.stationName || stationData?.stationName || 'BEMS Attendance Kiosk',
                  status: emp.status,
                  timeStr: inFormatted,
                });
              }

              seenPunchesRef.current.set(emp.employeeId, {
                checkIn: currIn,
                checkOut: currOut,
              });
            }
          }

          setRecentPunches(activeToday);
          setTotalPresentCount(data.totalPresent ?? activeToday.length);
        }
      } catch (e) {
        // quiet ignore
      } finally {
        setIsSyncingRecent(false);
      }
    },
    [selectedStationCode, stationData?.stationCode, stationData?.stationName, triggerCelebration]
  );

  const handlePinPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinBusy(true);
    setPinResult(null);
    try {
      const res = await fetch('/api/attendance/kiosk-punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffIdentifier,
          kioskPin,
          action: pinAction,
          stationCode: selectedStationCode || stationData?.stationCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed.');
      setPinResult({ ok: true, message: data.message });
      setStaffIdentifier('');
      setKioskPin('');
      setPinModalOpen(false);
      setPinResult(null);

      // Immediately show Big-Photo Welcome / Goodbye Celebration Modal and mark seen
      if (data.employeeId && data.record) {
        seenPunchesRef.current.set(data.employeeId, {
          checkIn: data.record.checkInTime ? String(data.record.checkInTime) : undefined,
          checkOut: data.record.checkOutTime ? String(data.record.checkOutTime) : undefined,
        });
      }
      triggerCelebration({
        action: data.action === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN',
        employeeId: data.employeeId || 'staff',
        legalName: data.employeeName || 'Staff Member',
        employeeNumber: data.employeeNumber || '',
        avatarUrl: data.avatarUrl || null,
        department: data.department || 'Operations',
        subsidiary: data.subsidiary || stationData?.organizationName || 'BEMS Group',
        stationName: data.stationName || stationData?.stationName || 'BEMS Attendance Kiosk',
        status: data.status || 'PRESENT',
        timeStr: data.timeStr || currentTime,
      });

      void fetchRecent();
    } catch (err: any) {
      setPinResult({ ok: false, message: err.message || 'Check-in failed.' });
    } finally {
      setPinBusy(false);
    }
  };

  // Live West Africa Time Clock
  useEffect(() => {
    function tick() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Africa/Lagos',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-GB', {
          timeZone: 'Africa/Lagos',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      );
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Register Service Worker & capture PWA install prompt
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    }

    // Check if already installed
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) {
        setIsInstalled(true);
      }
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Fetch token and pre-rendered QR for the active/selected Kiosk Location
  const fetchToken = useCallback(async (overrideCode?: string | React.MouseEvent) => {
    try {
      setLoadError(null);
      let codeToFetch = typeof overrideCode === 'string' ? overrideCode : selectedStationCode;
      if (!codeToFetch && typeof window !== 'undefined') {
        const urlStation = new URLSearchParams(window.location.search).get('station') || '';
        const storedStation = localStorage.getItem('bems_kiosk_station_code') || '';
        codeToFetch = urlStation || storedStation;
      }
      const qrUrl = codeToFetch
        ? `/api/attendance/station/qr?stationCode=${encodeURIComponent(codeToFetch)}`
        : '/api/attendance/station/qr';
      const res = await fetch(qrUrl, { cache: 'no-store', credentials: 'include' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        if (res.status === 401 || errorData?.requiresActivation) {
          setRequiresActivation(true);
          setStationData(null);
          if (Array.isArray(errorData?.availableStations)) {
            setAvailableStations(errorData.availableStations);
            if (!codeToFetch && errorData.availableStations[0]?.code) {
              setSelectedStationCode(errorData.availableStations[0].code);
            }
          }
          setIsLoading(false);
          return;
        }
        throw new Error(errorData?.error || 'Unable to connect to station server');
      }
      const data: StationData = await res.json();
      setRequiresActivation(false);
      setStationData(data);
      if (data.stationCode) {
        setSelectedStationCode(data.stationCode);
        localStorage.setItem('bems_kiosk_station_code', data.stationCode);
      }
      localStorage.removeItem('bems_kiosk_station_secret');
      setSecondsRemaining(data.expiresInSeconds || 45);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error loading QR code:', err);
      setLoadError(err?.message || 'Unable to refresh QR code');
      setIsLoading(false);
    }
  }, [selectedStationCode]);

  const handleActivateKiosk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationPassword.trim() || activatingStation) return;
    setActivatingStation(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/attendance/station/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          kioskPassword: activationPassword.trim(),
          stationCode: selectedStationCode || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Invalid Kiosk Access Password.');
      }
      setActivationPassword('');
      setRequiresActivation(false);
      await fetchToken(json.stationCode || selectedStationCode);
    } catch (err: any) {
      setLoadError(err?.message || 'Activation failed.');
    } finally {
      setActivatingStation(false);
    }
  };

  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  // 45-second countdown timer (paused while locked behind password gate)
  useEffect(() => {
    if (requiresActivation || !stationData) return;
    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          void fetchToken();
          return 45;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchToken, requiresActivation, stationData]);

  // Poll recent arrivals & detect live QR clock-in/clock-out every 3 seconds (only AFTER kiosk unlock)
  useEffect(() => {
    if (requiresActivation || isLoading || !stationData) return;
    void fetchRecent();
    const interval = setInterval(() => void fetchRecent(), 3000);
    return () => clearInterval(interval);
  }, [fetchRecent, requiresActivation, isLoading, stationData]);

  const captureKioskGps = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setCalError('Browser geolocation is not supported on this device. Ensure Location Services are enabled.');
      return;
    }
    setCalibratingGps(true);
    setCalError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCalCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
        });
        setCalibratingGps(false);
      },
      (err) => {
        setCalibratingGps(false);
        setCalError(
          err.code === 1
            ? 'Location permission was denied. Please allow Location access in your browser bar and click Re-capture GPS.'
            : 'Could not acquire high-accuracy GPS yet. Click Re-capture GPS to try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (stationData?.requiresCalibration) {
      setCalRadius(stationData.radiusMeters || 100);
      if (!calCoords && !calibratingGps) {
        captureKioskGps();
      }
    }
  }, [stationData?.requiresCalibration, stationData?.stationCode, stationData?.radiusMeters, calCoords, calibratingGps, captureKioskGps]);

  const handleSaveCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calCoords || savingCalibration) return;
    setSavingCalibration(true);
    setCalError(null);
    try {
      const res = await fetch('/api/attendance/station/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          stationCode: stationData?.stationCode,
          latitude: calCoords.lat,
          longitude: calCoords.lng,
          accuracyMeters: calCoords.accuracy,
          radiusMeters: calRadius,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Could not save kiosk location and router setup.');
      }
      await fetchToken(stationData?.stationCode);
    } catch (err: any) {
      setCalError(err?.message || 'Failed to lock kiosk location and router.');
    } finally {
      setSavingCalibration(false);
    }
  };

  // Synchronize System Fullscreen state on fullscreenchange (Esc or browser button)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );
      setIsFullscreen(activeFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle ESC key to exit QR-only fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isQrOnlyFullscreen) {
          setIsQrOnlyFullscreen(false);
        }
        if (showInstallModal) {
          setShowInstallModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQrOnlyFullscreen, showInstallModal]);

  // Toggle System Fullscreen
  const togglePageFullscreen = () => {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Trigger PWA Installation on PC and start launcher download
  const handleInstallClick = async () => {
    // 1. Immediately trigger the download of the PC launcher file
    try {
      const link = document.createElement('a');
      link.href = '/api/download/kiosk-launcher?type=bat';
      link.download = 'Launch-BEMS-Kiosk-PC.bat';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      // quiet fallback
    }

    // 2. Also trigger PWA prompt if available, or show install modal
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        setShowInstallModal(true);
      }
    } else {
      // Guide user to the browser's native install option in address bar
      setShowInstallModal(true);
    }
  };

  // Filtered staff list for search
  const filteredStaff = recentPunches.filter((p: any) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = (p.legalName || '').toLowerCase().includes(term);
    const roleMatch = (p.role || '').toLowerCase().includes(term);
    const deptMatch = (p.department || '').toLowerCase().includes(term);
    const subMatch = (p.subsidiary || '').toLowerCase().includes(term);
    const idMatch = (p.employeeNumber || '').toLowerCase().includes(term);
    return nameMatch || roleMatch || deptMatch || subMatch || idMatch;
  });

  // FULL-SCREEN PASSWORD GATE FIRST: Never expose any kiosk dashboard, QR frame, or staff roster before unlocking
  if ((isLoading && !stationData) || requiresActivation) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
        }}
      >
        {isLoading && !requiresActivation ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              padding: '36px 32px',
              width: '100%',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
            }}
          >
            <RefreshCw size={32} className="animate-spin" color="#ea580c" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Verifying Kiosk Access...</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Checking authorized reception terminal session
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleActivateKiosk}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '22px',
              padding: '32px 30px',
              width: '100%',
              maxWidth: '430px',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Lock size={22} color="#ea580c" />
              </div>
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#ea580c',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    marginBottom: '4px',
                  }}
                >
                  PROTECTED TERMINAL
                </div>
                <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
                  Unlock Attendance Kiosk
                </h1>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.55 }}>
              Enter the <strong>Kiosk Access Password</strong> configured by HR Admin before viewing live attendance QR codes or station records.
            </div>

            {availableStations.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  Office Kiosk Station
                </label>
                <select
                  value={selectedStationCode}
                  onChange={(e) => {
                    setSelectedStationCode(e.target.value);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('bems_kiosk_station_code', e.target.value);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {availableStations.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.name} {st.stateLocation ? `(${st.stateLocation})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                Kiosk Access Password
              </label>
              <input
                type="password"
                required
                autoFocus
                value={activationPassword}
                onChange={(e) => setActivationPassword(e.target.value)}
                placeholder="Enter Kiosk Access Password..."
                style={{
                  width: '100%',
                  padding: '11px 13px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '13.5px',
                  color: '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {loadError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {loadError}
              </div>
            )}

            <button
              type="submit"
              disabled={activatingStation}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '11px',
                border: 'none',
                background: '#ea580c',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: activatingStation ? 'wait' : 'pointer',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.22)',
              }}
            >
              {activatingStation ? 'Unlocking Terminal...' : 'Unlock & Open Kiosk'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ONE-TIME LOCATION & ROUTER CALIBRATION MODAL (Triggers once per station until HR Admin resets) */}
      {stationData?.requiresCalibration && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(6px)',
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
          }}
        >
          <form
            onSubmit={handleSaveCalibration}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '22px',
              padding: '28px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.16)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <MapPin size={22} color="#ea580c" />
              </div>
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#ea580c',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    marginBottom: '3px',
                  }}
                >
                  ONE-TIME STATION SETUP
                </div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                  Bind Office Location &amp; Router IP
                </h2>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.55 }}>
              Lock the exact physical GPS coordinates and Wi-Fi / Starlink router connection for{' '}
              <strong style={{ color: '#0f172a' }}>{stationData.stationName}</strong>. Staff phones scanning this kiosk will be matched against this exact location and router. Once saved, this setup will not appear again unless reset by HR Admin.
            </div>

            {/* 1. Physical GPS Coordinates */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={15} color="#059669" />
                  <span>1. Physical Reception GPS Coordinates</span>
                </div>
                <button
                  type="button"
                  disabled={calibratingGps}
                  onClick={captureKioskGps}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <RefreshCw size={12} className={calibratingGps ? 'animate-spin' : ''} />
                  <span>{calibratingGps ? 'Capturing GPS...' : 'Re-capture GPS'}</span>
                </button>
              </div>

              {calCoords ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#047857' }}>
                    Lat: {calCoords.lat}, Lng: {calCoords.lng}
                  </div>
                  {calCoords.accuracy !== null && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #a7f3d0',
                      }}
                    >
                      Accuracy ±{calCoords.accuracy}m
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {calibratingGps
                    ? 'Acquiring high-precision GPS from this device...'
                    : 'Allow browser Location access and click Re-capture GPS.'}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '6px', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>Allowed Geofence Radius:</span>
                <select
                  value={calRadius}
                  onChange={(e) => setCalRadius(Number(e.target.value))}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  <option value={50}>50 meters (Tight Building)</option>
                  <option value={100}>100 meters (Standard Office)</option>
                  <option value={150}>150 meters (Compound)</option>
                  <option value={250}>250 meters (Large Facility)</option>
                </select>
              </div>
            </div>

            {/* 2. Office Router / Starlink Public IP */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wifi size={15} color="#0284c7" />
                  <span>2. Office Router / Starlink IP</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                  Make sure this kiosk is connected to the office Wi-Fi / Starlink router.
                </div>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  padding: '5px 10px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  fontFamily: 'monospace',
                }}
              >
                {stationData.detectedRouterIp || 'Auto-detected on save'}
              </span>
            </div>

            {calError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {calError}
              </div>
            )}

            <button
              type="submit"
              disabled={!calCoords || savingCalibration}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '11px',
                border: 'none',
                background: !calCoords ? '#cbd5e1' : '#ea580c',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: !calCoords ? 'not-allowed' : savingCalibration ? 'wait' : 'pointer',
              }}
            >
              {savingCalibration ? 'Locking Location & Router...' : 'Confirm & Lock Location & Router IP'}
            </button>
          </form>
        </div>
      )}
      {/* 
        TOP HEADER:
        "this should close on full screen" -> When isFullscreen is active, this header automatically closes/hides.
      */}
      {!isFullscreen && (
        <header
          style={{
            padding: '16px 36px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <img
                src="/bems-mark.png?v=20261024"
                alt="BEMS"
                style={{ width: 26, height: 26, objectFit: 'contain' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
                  BEMS Attendance Kiosk
                </h1>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 9px',
                    borderRadius: '20px',
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Radio size={11} className="animate-pulse" />
                  LIVE
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>
                  {stationData?.stationName || 'BEMS Office Station'}
                  {stationData?.stateLocation ? ` (${stationData.stateLocation})` : ''} · {stationData?.organizationName || 'BEMS Group'}
                </span>
                {stationData?.stations && stationData.stations.length > 1 && (
                  <select
                    value={stationData.stationCode}
                    onChange={(e) => {
                      const nextCode = e.target.value;
                      setSelectedStationCode(nextCode);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('bems_kiosk_station_code', nextCode);
                        const url = new URL(window.location.href);
                        url.searchParams.set('station', nextCode);
                        window.history.replaceState({}, '', url.toString());
                      }
                      void fetchToken(nextCode);
                      void fetchRecent(nextCode, true);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#0f172a',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Switch physical Kiosk Location"
                  >
                    {stationData.stations.map((st) => (
                      <option key={st.code} value={st.code}>
                        📍 {st.name}{st.stateLocation ? ` — ${st.stateLocation}` : ''} ({st.code})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Top Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Offline Staff ID + PIN Check-In Button */}
            <button
              onClick={() => {
                setPinResult(null);
                setPinModalOpen(true);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                background: '#0d9488',
                border: 'none',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)',
              }}
              title="Clock in or out using Staff ID and 4-Digit Kiosk PIN (no smartphone needed)"
            >
              <UserCheck size={14} />
              <span>Staff ID + PIN Check-In (No Phone)</span>
            </button>

            {/* Download/Install on PC Button */}
            <button
              onClick={handleInstallClick}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                background: isInstalled ? '#f8fafc' : '#eff6ff',
                border: isInstalled ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                color: isInstalled ? '#475569' : '#1d4ed8',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                transition: 'all 0.15s ease',
              }}
              title="Download & install BEMS Kiosk as standalone software on your PC"
            >
              {isInstalled ? <Check size={14} color="#059669" /> : <Laptop size={14} />}
              <span>{isInstalled ? 'App Installed' : 'Download PC App'}</span>
            </button>

            {/* Refresh Token */}
            <button
              onClick={fetchToken}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Refresh QR token"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {/* Fullscreen 1: QR Code Only Fullscreen */}
            <button
              onClick={() => setIsQrOnlyFullscreen(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#059669',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Expand only QR code to full screen"
            >
              <Maximize2 size={14} />
              <span>Fullscreen QR</span>
            </button>

            {/* Fullscreen 2: System Fullscreen (Hides header, fills entire monitor) */}
            <button
              onClick={togglePageFullscreen}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Put entire kiosk in full screen"
            >
              <Maximize2 size={14} />
              <span>Kiosk Screen</span>
            </button>
          </div>
        </header>
      )}

      {/* Floating Exit Button for System Fullscreen Mode (Allows clean exit and restores header) */}
      {isFullscreen && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              fontWeight: 800,
              color: '#059669',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
          >
            ● LIVE KIOSK FULLSCREEN
          </span>

          <button
            onClick={togglePageFullscreen}
            style={{
              padding: '9px 18px',
              borderRadius: '12px',
              background: '#0f172a',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '13px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 8px 25px rgba(15, 23, 42, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <Minimize2 size={15} />
            <span>Exit Fullscreen (Esc)</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          maxWidth: '1340px',
          width: '100%',
          margin: '0 auto',
          padding: isFullscreen ? '20px 28px' : '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Top Info & Summary Card (Full Width at Top) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            padding: '22px 28px',
            boxShadow: '0 4px 20px rgba(15, 23, 42, 0.03)',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '32px',
            alignItems: 'center',
          }}
        >
          {/* Big "Total Clock-Ins" Box */}
          <div
            style={{
              padding: '16px 24px',
              borderRadius: '16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              minWidth: '130px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Clock-Ins
            </div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1, marginTop: '4px' }}>
              {totalPresentCount}
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginTop: '4px' }}>
              ● Today's Present
            </div>
          </div>

          {/* Grid of Key Info Parameters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '18px 24px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Official WAT Time</div>
              <strong style={{ fontSize: '15px', color: '#0f172a', fontWeight: 800, display: 'block', marginTop: '2px' }}>
                {currentTime || '--:--'}
              </strong>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{currentDate}</span>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Arrival Window</div>
              <strong style={{ fontSize: '15px', color: '#0284c7', fontWeight: 800, display: 'block', marginTop: '2px' }}>
                {stationData?.earliestCheckInTime || '07:00'} – {stationData?.resumptionTime || '08:00'} AM
              </strong>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Prior to {stationData?.earliestCheckInTime || '07:00'} locked
              </span>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Grace Period Limit</div>
              <strong style={{ fontSize: '15px', color: '#d97706', fontWeight: 800, display: 'block', marginTop: '2px' }}>
                {(() => {
                  const [rh, rm] = (stationData?.resumptionTime || '08:00').split(':').map(Number);
                  const total = (Number.isFinite(rh) ? rh : 8) * 60 + (Number.isFinite(rm) ? rm : 0) + (stationData?.gracePeriodMinutes ?? 15);
                  const gh = Math.floor(total / 60) % 24;
                  const gm = total % 60;
                  const suffix = gh >= 12 ? 'PM' : 'AM';
                  const h12 = gh % 12 === 0 ? 12 : gh % 12;
                  return `${String(h12).padStart(2, '0')}:${String(gm).padStart(2, '0')} ${suffix}`;
                })()}
              </strong>
              <span style={{ fontSize: '11px', color: '#dc2626' }}>
                {stationData?.latenessDeductionPercent ?? 2}% salary deduction after
              </span>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Network Security</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: (!stationData?.requireStarlinkIp || stationData?.powerOutageMode) ? '#fffbeb' : '#ecfdf5',
                    color: (!stationData?.requireStarlinkIp || stationData?.powerOutageMode) ? '#b45309' : '#059669',
                    border: (!stationData?.requireStarlinkIp || stationData?.powerOutageMode) ? '1px solid #fde68a' : '1px solid #a7f3d0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {(!stationData?.requireStarlinkIp || stationData?.powerOutageMode) ? <Zap size={10} /> : <Wifi size={10} />}
                  {(!stationData?.requireStarlinkIp || stationData?.powerOutageMode) ? 'Starlink Bypassed (All Networks)' : 'Starlink Wi-Fi Enforced'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                {stationData?.requireGeofence === false ? 'Any Location Allowed' : `${stationData?.radiusMeters || 100}m Geofence`}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Main Section: QR Code on the Left, List of Staff on the Right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(380px, 460px) 1fr',
            gap: '24px',
            alignItems: 'stretch',
          }}
        >
          {/* LEFT COLUMN: Dynamic QR Showcase Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              border: '1px solid #e2e8f0',
              padding: '32px 28px',
              boxShadow: '0 8px 30px rgba(15, 23, 42, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Top Prompt Badge */}
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: '#059669',
                  background: '#ecfdf5',
                  padding: '5px 14px',
                  borderRadius: '20px',
                  border: '1px solid #a7f3d0',
                  letterSpacing: '0.5px',
                }}
              >
                <Sparkles size={12} />
                POINT MOBILE APP CAMERA HERE
              </span>
            </div>

            {/* QR Viewfinder with Corner Bracket Reticles */}
            <div
              style={{
                width: '300px',
                height: '300px',
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                padding: '12px',
              }}
            >
              {/* Top-Left Bracket Reticle */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '32px',
                  height: '32px',
                  borderTop: '4px solid #10b981',
                  borderLeft: '4px solid #10b981',
                  borderRadius: '10px 0 0 0',
                }}
              />

              {/* Top-Right Bracket Reticle */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '32px',
                  height: '32px',
                  borderTop: '4px solid #10b981',
                  borderRight: '4px solid #10b981',
                  borderRadius: '0 10px 0 0',
                }}
              />

              {/* Bottom-Left Bracket Reticle */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: '32px',
                  height: '32px',
                  borderBottom: '4px solid #10b981',
                  borderLeft: '4px solid #10b981',
                  borderRadius: '0 0 0 10px',
                }}
              />

              {/* Bottom-Right Bracket Reticle */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '32px',
                  height: '32px',
                  borderBottom: '4px solid #10b981',
                  borderRight: '4px solid #10b981',
                  borderRadius: '0 0 10px 0',
                }}
              />

              {/* Dynamic QR Display */}
              <div
                style={{
                  width: '264px',
                  height: '264px',
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  background: '#ffffff',
                }}
              >
                {isLoading ? (
                  <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={36} className="animate-spin" color="#10b981" />
                    <div style={{ fontSize: '12px', marginTop: '10px', fontWeight: 700, color: '#334155' }}>
                      Generating secure QR...
                    </div>
                  </div>
                ) : requiresActivation ? (
                  <form onSubmit={handleActivateKiosk} style={{ textAlign: 'center', padding: '16px', width: '100%' }}>
                    <AlertCircle size={28} color="#ea580c" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                      Unlock Reception Kiosk
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                      Enter the Kiosk Access Password set in HR Attendance Admin.
                    </div>
                    <input
                      type="password"
                      required
                      value={activationPassword}
                      onChange={(e) => setActivationPassword(e.target.value)}
                      placeholder="Kiosk access password..."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        marginBottom: '8px',
                        color: '#0f172a',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={activatingStation}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#ea580c',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {activatingStation ? 'Activating...' : 'Bind & Unlock Kiosk'}
                    </button>
                    {loadError && (
                      <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '6px', fontWeight: 600 }}>
                        {loadError}
                      </div>
                    )}
                  </form>
                ) : loadError ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#b91c1c' }}>
                    <AlertCircle size={32} style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '12px', fontWeight: 800 }}>{loadError}</div>
                  </div>
                ) : stationData?.qrSvg ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: stationData.qrSvg }}
                    style={{ width: '256px', height: '256px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  />
                ) : stationData?.qrDataUrl ? (
                  <img
                    src={stationData.qrDataUrl}
                    alt="Attendance QR Code"
                    style={{ width: '256px', height: '256px', display: 'block' }}
                  />
                ) : (
                  <div style={{ color: '#64748b', fontSize: '12px' }}>Loading QR...</div>
                )}

                {/* Animated Horizontal Laser Scanning Line */}
                {!isLoading && !loadError && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: 'linear-gradient(90deg, transparent, #10b981, #34d399, transparent)',
                      boxShadow: '0 0 16px 4px rgba(16, 185, 129, 0.65)',
                      animation: 'scanLaser 2.4s ease-in-out infinite alternate',
                      zIndex: 3,
                    }}
                  />
                )}

                {/* Center Brand Emblem Watermark */}
                {!isLoading && !loadError && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: '#ffffff',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                      display: 'grid',
                      placeItems: 'center',
                      border: '3px solid #10b981',
                      zIndex: 4,
                    }}
                  >
                    <img
                      src="/bems-mark.png?v=20261024"
                      alt="BEMS"
                      style={{ width: 28, height: 28, objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Subtitle Under QR */}
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginTop: '16px', textAlign: 'center' }}>
              Scan dynamic QR code with BEMS Staff App to record presence
            </div>

            {/* Countdown & Security Status */}
            <div style={{ width: '100%', maxWidth: '300px', marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '6px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 800 }}>
                  <ShieldCheck size={14} />
                  HMAC-SHA256 ACTIVE
                </span>
                <span style={{ color: '#64748b', fontWeight: 700 }}>
                  Refreshes in <strong style={{ color: '#059669', fontSize: '13px' }}>{secondsRemaining}s</strong>
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(secondsRemaining / 45) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                    borderRadius: '10px',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>

            {/* Fullscreen 1: QR Only Button */}
            <button
              onClick={() => setIsQrOnlyFullscreen(true)}
              style={{
                marginTop: '18px',
                width: '100%',
                maxWidth: '300px',
                padding: '11px 16px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ecfdf5';
                e.currentTarget.style.borderColor = '#10b981';
                e.currentTarget.style.color = '#059669';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.color = '#0f172a';
              }}
            >
              <Maximize2 size={15} />
              <span>Fullscreen QR Code</span>
            </button>
          </div>

          {/* RIGHT COLUMN: List of Staff That Have Marked Attendance */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              border: '1px solid #e2e8f0',
              padding: '24px 28px',
              boxShadow: '0 8px 30px rgba(15, 23, 42, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '480px',
            }}
          >
            {/* Header: Title, Count, & Search */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                paddingBottom: '16px',
                borderBottom: '1px solid #f1f5f9',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#16a34a',
                  }}
                >
                  <UserCheck size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Marked Attendance Today
                    </h2>
                    <button
                      onClick={() => void fetchRecent()}
                      disabled={isSyncingRecent}
                      title="Force refresh live attendance list"
                      style={{
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        cursor: isSyncingRecent ? 'wait' : 'pointer',
                        padding: '3px 8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: isSyncingRecent ? '#059669' : '#64748b',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <RefreshCw size={11} className={isSyncingRecent ? 'animate-spin text-emerald-600' : ''} />
                      <span>{isSyncingRecent ? 'Syncing...' : 'Sync'}</span>
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                    Signed in from <strong>{stationData?.stationName || 'this Kiosk Location'}</strong>
                    {stationData?.stateLocation ? ` (${stationData.stateLocation})` : ''}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Search Filter */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Search size={14} color="#94a3b8" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search staff..."
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '12px',
                      color: '#0f172a',
                      outline: 'none',
                      width: '120px',
                    }}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} color="#94a3b8" />
                    </button>
                  )}
                </div>

                {/* Badge Counts: Clocked In, On Shift, Clocked Out */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: '#ecfdf5',
                      color: '#059669',
                      border: '1px solid #a7f3d0',
                    }}
                    title="Total staff who clocked in at this location today"
                  >
                    {searchTerm ? `${filteredStaff.length} / ${recentPunches.length}` : `${recentPunches.length}`} Clocked In
                  </span>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                    }}
                    title="Staff currently active on shift (not yet clocked out)"
                  >
                    {recentPunches.filter((p: any) => !p.checkOutTime).length} On Shift
                  </span>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: '#f5f3ff',
                      color: '#6d28d9',
                      border: '1px solid #ddd6fe',
                    }}
                    title="Staff who have completed shift sign-out today"
                  >
                    {recentPunches.filter((p: any) => Boolean(p.checkOutTime)).length} Clocked Out
                  </span>
                </div>
              </div>
            </div>

            {/* Staff List Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxHeight: isFullscreen ? 'calc(100vh - 280px)' : '620px',
                paddingRight: '4px',
              }}
            >
              {filteredStaff.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#64748b',
                  }}
                >
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#94a3b8',
                      marginBottom: '12px',
                    }}
                  >
                    <Users size={24} />
                  </div>
                  <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                    {searchTerm ? 'No matching staff found' : 'No attendance recorded yet today'}
                  </strong>
                  <p style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '300px', marginTop: '4px' }}>
                    {searchTerm
                      ? 'Try searching with a different employee name or role.'
                      : 'Staff clock-ins scanned on the BEMS Staff App will immediately populate here live.'}
                  </p>
                </div>
              ) : (
                filteredStaff.map((staff: any) => {
                  const checkInFormatted = staff.checkInTime
                    ? new Date(staff.checkInTime).toLocaleTimeString('en-US', {
                        timeZone: 'Africa/Lagos',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '--:--';

                  const hasCheckedOut = Boolean(staff.checkOutTime);
                  const checkOutFormatted = staff.checkOutTime
                    ? new Date(staff.checkOutTime).toLocaleTimeString('en-US', {
                        timeZone: 'Africa/Lagos',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : null;

                  const isLate = staff.status === 'LATE';
                  const initials = (staff.legalName || 'ST')
                    .split(' ')
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <div
                      key={staff.employeeId}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {staff.avatarUrl ? (
                          <img
                            src={staff.avatarUrl}
                            alt={staff.legalName}
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '10px',
                              objectFit: 'cover',
                              border: `1.5px solid ${isLate ? '#fecaca' : '#a7f3d0'}`,
                              flexShrink: 0,
                              background: '#ffffff',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '10px',
                              background: isLate ? '#fef2f2' : '#ecfdf5',
                              border: `1px solid ${isLate ? '#fecaca' : '#a7f3d0'}`,
                              color: isLate ? '#dc2626' : '#059669',
                              fontWeight: 800,
                              fontSize: '13px',
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                            {staff.legalName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {staff.employeeNumber ? `${staff.employeeNumber} · ` : ''}{staff.department || staff.role}
                            {staff.subsidiary ? ` · ${staff.subsidiary}` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Dual Clock-In & Clock-Out Status Block */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* 1. CLOCK IN STATUS */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 10px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: `1px solid ${isLate ? '#fecaca' : '#a7f3d0'}`,
                          }}
                        >
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                            IN:
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0f172a' }}>
                            {checkInFormatted}
                          </span>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '5px',
                              background: isLate ? '#fef2f2' : '#ecfdf5',
                              color: isLate ? '#dc2626' : '#059669',
                              letterSpacing: '0.3px',
                            }}
                          >
                            {isLate ? 'LATE' : 'ON TIME'}
                          </span>
                        </div>

                        {/* 2. CLOCK OUT STATUS */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 10px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: `1px solid ${hasCheckedOut ? '#ddd6fe' : '#bfdbfe'}`,
                          }}
                        >
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                            OUT:
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: hasCheckedOut ? '#0f172a' : '#64748b' }}>
                            {checkOutFormatted || '--:--'}
                          </span>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '5px',
                              background: hasCheckedOut ? '#f5f3ff' : '#eff6ff',
                              color: hasCheckedOut ? '#6d28d9' : '#1d4ed8',
                              letterSpacing: '0.3px',
                            }}
                          >
                            {hasCheckedOut ? 'CLOCKED OUT' : 'ON SHIFT'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Summary */}
            {recentPunches.length > 0 && (
              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '10px',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: '#64748b',
                  fontWeight: 600,
                }}
              >
                <span>
                  Showing <strong style={{ color: '#0f172a' }}>{filteredStaff.length}</strong> of{' '}
                  <strong style={{ color: '#0f172a' }}>{recentPunches.length}</strong> clocked in ·{' '}
                  <strong style={{ color: '#1d4ed8' }}>{recentPunches.filter((p: any) => !p.checkOutTime).length}</strong> on shift ·{' '}
                  <strong style={{ color: '#6d28d9' }}>{recentPunches.filter((p: any) => Boolean(p.checkOutTime)).length}</strong> clocked out
                </span>
                <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={13} />
                  Live Sync
                </span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* FULLSCREEN 1: DEDICATED QR ONLY FULLSCREEN OVERLAY */}
      {isQrOnlyFullscreen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          {/* Top Floating Control Bar */}
          <div
            style={{
              position: 'absolute',
              top: '24px',
              left: '32px',
              right: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <img
                  src="/bems-mark.png?v=20261024"
                  alt="BEMS"
                  style={{ width: 24, height: 24, objectFit: 'contain' }}
                />
              </div>
              <div>
                <strong style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                  BEMS Dynamic Presence Kiosk
                </strong>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Official WAT Time: <strong style={{ color: '#0f172a' }}>{currentTime}</strong> · Total Present Today: <strong style={{ color: '#059669' }}>{totalPresentCount}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={fetchToken}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setIsQrOnlyFullscreen(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
                }}
                title="Close QR Fullscreen"
              >
                <X size={16} />
                <span>Exit Fullscreen (Esc)</span>
              </button>
            </div>
          </div>

          {/* Centered Large QR Viewfinder */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '40px',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: '#059669',
                background: '#ecfdf5',
                padding: '6px 18px',
                borderRadius: '24px',
                border: '1px solid #a7f3d0',
                letterSpacing: '0.6px',
                marginBottom: '24px',
              }}
            >
              <Sparkles size={14} />
              POINT MOBILE APP CAMERA HERE
            </span>

            {/* Scaled-Up QR Viewfinder with Corner Brackets */}
            <div
              style={{
                width: '390px',
                height: '390px',
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                padding: '16px',
              }}
            >
              {/* Brackets */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '42px',
                  height: '42px',
                  borderTop: '5px solid #10b981',
                  borderLeft: '5px solid #10b981',
                  borderRadius: '14px 0 0 0',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '42px',
                  height: '42px',
                  borderTop: '5px solid #10b981',
                  borderRight: '5px solid #10b981',
                  borderRadius: '0 14px 0 0',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: '42px',
                  height: '42px',
                  borderBottom: '5px solid #10b981',
                  borderLeft: '5px solid #10b981',
                  borderRadius: '0 0 0 14px',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '42px',
                  height: '42px',
                  borderBottom: '5px solid #10b981',
                  borderRight: '5px solid #10b981',
                  borderRadius: '0 0 14px 0',
                }}
              />

              {/* QR Canvas */}
              <div
                style={{
                  width: '344px',
                  height: '344px',
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: '18px',
                  display: 'grid',
                  placeItems: 'center',
                  background: '#ffffff',
                }}
              >
                {isLoading ? (
                  <RefreshCw size={48} className="animate-spin" color="#10b981" />
                ) : stationData?.qrSvg ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: stationData.qrSvg }}
                    style={{ width: '336px', height: '336px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  />
                ) : stationData?.qrDataUrl ? (
                  <img
                    src={stationData.qrDataUrl}
                    alt="Attendance QR Code"
                    style={{ width: '336px', height: '336px', display: 'block' }}
                  />
                ) : null}

                {/* Animated Horizontal Laser Line */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: '5px',
                    background: 'linear-gradient(90deg, transparent, #10b981, #34d399, transparent)',
                    boxShadow: '0 0 20px 5px rgba(16, 185, 129, 0.7)',
                    animation: 'scanLaser 2.4s ease-in-out infinite alternate',
                    zIndex: 3,
                  }}
                />

                {/* Center Brand Watermark */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: '#ffffff',
                    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
                    display: 'grid',
                    placeItems: 'center',
                    border: '3px solid #10b981',
                    zIndex: 4,
                  }}
                >
                  <img
                    src="/bems-mark.png?v=20261024"
                    alt="BEMS"
                    style={{ width: 36, height: 36, objectFit: 'contain' }}
                  />
                </div>
              </div>
            </div>

            {/* Subtitle Under Scaled QR */}
            <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600, marginTop: '22px', textAlign: 'center' }}>
              Scan dynamic QR code with BEMS Staff App to record presence
            </div>

            {/* Countdown & Security Status */}
            <div style={{ width: '100%', maxWidth: '380px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#059669', fontWeight: 800 }}>
                  <ShieldCheck size={16} />
                  HMAC-SHA256 SECURED
                </span>
                <span style={{ color: '#64748b', fontWeight: 700 }}>
                  Refreshes in <strong style={{ color: '#059669', fontSize: '15px' }}>{secondsRemaining}s</strong>
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(secondsRemaining / 45) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                    borderRadius: '10px',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PWA PC SOFTWARE DOWNLOAD & INSTALLATION GUIDE MODAL */}
      {showInstallModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setShowInstallModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '36px 32px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
              position: 'relative',
              textAlign: 'left',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInstallModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                color: '#64748b',
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#1d4ed8',
                }}
              >
                <Laptop size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Install BEMS Kiosk as PC Software
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Run as a standalone desktop app on Windows or Mac
                </div>
              </div>
            </div>

            <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, marginBottom: '20px' }}>
              To install this kiosk as dedicated software on your computer from Google Chrome or Microsoft Edge:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '12px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div style={{ fontSize: '13px', color: '#0f172a' }}>
                  Look at the right side of your browser&apos;s address/URL bar at the top of your screen.
                </div>
              </div>

              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '12px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div style={{ fontSize: '13px', color: '#0f172a' }}>
                  Click the <strong>Install Icon (⊕ or 💻)</strong> in the address bar, or click Browser Menu (⋮) &rarr; <strong>&quot;Save and share&quot; &rarr; &quot;Install BEMS Attendance Kiosk&quot;</strong>.
                </div>
              </div>

              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '12px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div style={{ fontSize: '13px', color: '#0f172a' }}>
                  Click <strong>Install</strong>. A desktop shortcut will be created and BEMS Kiosk will open in its own clean window without any browser tabs!
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <a
                href="/api/download/kiosk-launcher?type=bat"
                download="Launch-BEMS-Kiosk-PC.bat"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#16a34a',
                  fontWeight: 800,
                  fontSize: '12px',
                  textAlign: 'center',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Download size={14} />
                <span>Download Windows .bat</span>
              </a>

              <a
                href="/api/download/kiosk-launcher?type=url"
                download="BEMS-Attendance-Kiosk.url"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  fontWeight: 800,
                  fontSize: '12px',
                  textAlign: 'center',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Download size={14} />
                <span>Download Shortcut .url</span>
              </a>
            </div>

            <button
              onClick={() => setShowInstallModal(false)}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Offline Staff ID + PIN Check-In Modal */}
      {pinModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(6px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPinModalOpen(false);
          }}
        >
          <form
            onSubmit={handlePinPunch}
            style={{
              background: '#ffffff',
              borderRadius: 20,
              maxWidth: 440,
              width: '100%',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#0d9488', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  📵 NO-SMARTPHONE KIOSK TERMINAL
                </span>
                <h3 style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 900, color: '#0f172a' }}>
                  Staff ID + 4-Digit PIN Punch
                </h3>
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
                  Enter your BEMS Staff ID (or full name) and your 4-digit Kiosk PIN.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPinAction('CHECK_IN')}
                style={{
                  padding: '10px',
                  borderRadius: 10,
                  border: pinAction === 'CHECK_IN' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                  background: pinAction === 'CHECK_IN' ? '#f0fdfa' : '#ffffff',
                  color: pinAction === 'CHECK_IN' ? '#0f766e' : '#475569',
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                ☀️ Morning Check-In
              </button>
              {(() => {
                const closingStr = stationData?.closingTime || '17:00';
                const [ch, cm] = closingStr.split(':').map(Number);
                const closingMins = (Number.isFinite(ch) ? ch : 17) * 60 + (Number.isFinite(cm) ? cm : 0);
                const lagosNow = new Date(Date.now() + 60 * 60 * 1000);
                const nowMins = lagosNow.getUTCHours() * 60 + lagosNow.getUTCMinutes();
                const locked = nowMins < closingMins;
                return (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      if (!locked) setPinAction('CHECK_OUT');
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: 10,
                      border: locked
                        ? '1px solid #e2e8f0'
                        : pinAction === 'CHECK_OUT'
                          ? '2px solid #2563eb'
                          : '1px solid #cbd5e1',
                      background: locked ? '#f8fafc' : pinAction === 'CHECK_OUT' ? '#eff6ff' : '#ffffff',
                      color: locked ? '#94a3b8' : pinAction === 'CHECK_OUT' ? '#1d4ed8' : '#475569',
                      fontWeight: 800,
                      fontSize: 12.5,
                      cursor: locked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {locked ? `🔒 Locked until ${closingStr}` : '🌙 Evening Check-Out'}
                  </button>
                );
              })()}
            </div>

            {pinResult && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: pinResult.ok ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${pinResult.ok ? '#a7f3d0' : '#fecaca'}`,
                  color: pinResult.ok ? '#065f46' : '#991b1b',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {pinResult.message}
              </div>
            )}

            <label style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>
              STAFF ID OR FULL NAME *
              <input
                required
                placeholder="e.g. BEMS-GRO-2026-1042 or Musa Abdullahi"
                value={staffIdentifier}
                onChange={(e) => setStaffIdentifier(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  fontWeight: 700,
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <label style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>
              4-DIGIT KIOSK PIN *
              <input
                required
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  fontSize: 20,
                  letterSpacing: '0.35em',
                  fontWeight: 900,
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <button
              type="submit"
              disabled={pinBusy}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: 12,
                border: 'none',
                background: pinAction === 'CHECK_IN' ? '#0d9488' : '#2563eb',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 14,
                cursor: pinBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {pinBusy ? 'Verifying...' : pinAction === 'CHECK_IN' ? 'Confirm Morning Check-In →' : 'Confirm Evening Check-Out →'}
            </button>
          </form>
        </div>
      )}

      {/* Instant Big-Photo Staff Clock-In / Clock-Out Welcome & Goodbye Celebration Modal */}
      {celebrationCard && (() => {
        const isClockOut = celebrationCard.action === 'CHECK_OUT';
        const isLate = !isClockOut && celebrationCard.status === 'LATE';
        const accentColor = isClockOut ? '#2563eb' : isLate ? '#ea580c' : '#059669';
        const accentBg = isClockOut ? '#eff6ff' : isLate ? '#fff7ed' : '#ecfdf5';
        const accentBorder = isClockOut ? '#bfdbfe' : isLate ? '#fed7aa' : '#a7f3d0';
        const initials = (celebrationCard.legalName || 'ST')
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();

        return (
          <div
            onClick={() => setCelebrationCard(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 12000,
              background: 'rgba(15, 23, 42, 0.68)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'grid',
              placeItems: 'center',
              padding: '24px',
              animation: 'fadeInCelebration 0.22s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '28px',
                border: `2px solid ${accentBorder}`,
                maxWidth: '560px',
                width: '100%',
                padding: '36px 32px 30px',
                boxShadow: '0 30px 70px -15px rgba(15, 23, 42, 0.38)',
                textAlign: 'center',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <button
                type="button"
                onClick={() => setCelebrationCard(null)}
                style={{
                  position: 'absolute',
                  top: '18px',
                  right: '18px',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
                title="Dismiss"
              >
                <X size={18} />
              </button>

              {/* Status Top Pill */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 16px',
                  borderRadius: '999px',
                  background: accentBg,
                  color: accentColor,
                  border: `1.5px solid ${accentBorder}`,
                  fontSize: '12px',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <CheckCircle2 size={15} />
                {isClockOut
                  ? `🌙 SHIFT COMPLETED & SIGNED OUT · ${celebrationCard.timeStr}`
                  : isLate
                  ? `⚠️ LATE ARRIVAL RECORDED · ${celebrationCard.timeStr}`
                  : `☀️ ON-TIME ARRIVAL VERIFIED · ${celebrationCard.timeStr}`}
              </span>

              {/* BIG STAFF PICTURE (172x172) */}
              <div
                style={{
                  width: '176px',
                  height: '176px',
                  borderRadius: '50%',
                  padding: '5px',
                  background: `linear-gradient(135deg, ${accentColor}, #10b981)`,
                  boxShadow: `0 16px 36px ${accentColor}33`,
                  display: 'grid',
                  placeItems: 'center',
                  marginTop: '4px',
                }}
              >
                {celebrationCard.avatarUrl ? (
                  <img
                    src={celebrationCard.avatarUrl}
                    alt={celebrationCard.legalName}
                    style={{
                      width: '166px',
                      height: '166px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      background: '#ffffff',
                      border: '4px solid #ffffff',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '166px',
                      height: '166px',
                      borderRadius: '50%',
                      background: accentBg,
                      color: accentColor,
                      border: '4px solid #ffffff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '56px',
                      fontWeight: 900,
                      letterSpacing: '-1px',
                    }}
                  >
                    {initials}
                  </div>
                )}
              </div>

              {/* Staff Name & Meta */}
              <div>
                <h2
                  style={{
                    margin: '4px 0 4px',
                    fontSize: '26px',
                    fontWeight: 900,
                    color: '#0f172a',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}
                >
                  {isClockOut
                    ? `Goodbye, ${celebrationCard.legalName}!`
                    : `Welcome, ${celebrationCard.legalName}!`}
                </h2>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
                  {celebrationCard.employeeNumber ? `${celebrationCard.employeeNumber} · ` : ''}
                  {celebrationCard.department || 'Operations'} · {celebrationCard.subsidiary || 'BEMS Group'}
                </div>
              </div>

              {/* Structured Greeting Card */}
              <div
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '14.5px',
                  lineHeight: 1.55,
                  color: '#334155',
                  fontWeight: 600,
                }}
              >
                {isClockOut ? (
                  <>
                    Your evening sign-out at <strong style={{ color: '#0f172a' }}>{celebrationCard.stationName || 'BEMS Office Kiosk'}</strong> is complete at <strong style={{ color: accentColor }}>{celebrationCard.timeStr}</strong>. Thank you for your hard work and dedication today — have a restful evening and a safe journey home!
                  </>
                ) : isLate ? (
                  <>
                    You clocked in at <strong style={{ color: '#0f172a' }}>{celebrationCard.stationName || 'BEMS Office Kiosk'}</strong> at <strong style={{ color: accentColor }}>{celebrationCard.timeStr}</strong> (after the morning resumption grace window). Have a focused and productive workday ahead!
                  </>
                ) : (
                  <>
                    You are <strong style={{ color: accentColor }}>on time</strong> at <strong style={{ color: '#0f172a' }}>{celebrationCard.stationName || 'BEMS Office Kiosk'}</strong> (<strong style={{ color: '#0f172a' }}>{celebrationCard.timeStr}</strong>). Thank you for your punctuality — have a great and productive workday!
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setCelebrationCard(null)}
                style={{
                  marginTop: '4px',
                  padding: '11px 28px',
                  borderRadius: '12px',
                  border: 'none',
                  background: accentColor,
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: `0 6px 18px ${accentColor}40`,
                }}
              >
                Done
              </button>
            </div>
          </div>
        );
      })()}

      {/* Animation Styles */}
      <style>{`
        @keyframes scanLaser {
          0% { top: 8%; }
          100% { top: 92%; }
        }
        @keyframes fadeInCelebration {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
