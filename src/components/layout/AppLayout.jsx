import React, { useState, useRef } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  Menu,
  X,
  Wrench,
  LogOut,
  ChevronRight,
  ClipboardList,
  Package,
  ShoppingCart,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import TourOverlay from "@/components/onboarding/TourOverlay";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Estimates", path: "/estimates", icon: FileText },
  { label: "Jobs", path: "/jobs", icon: ClipboardList },
  { label: "Invoices", path: "/invoices", icon: Receipt },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Inventory", path: "/inventory", icon: Package },
  { label: "Purchasing", path: "/purchase-orders", icon: ShoppingCart },
];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Tour refs — created here so sidebar + dashboard + job detail can all attach
  const tourRefs = {
    newEstimateRef: useRef(null),
    recentEstimatesRef: useRef(null),
    calendarRef: useRef(null),
    customersNavRef: useRef(null),
    jobStatusRef: useRef(null),
    jobPhotosRef: useRef(null),
    jobInvoiceRef: useRef(null),
  };

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-sidebar-border fixed inset-y-0 z-30">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
              <Wrench className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-sidebar-foreground leading-none">PipeFlow</h1>
              <p className="text-xs text-sidebar-foreground/50 mt-0.5">Estimator Pro</p>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              ref={item.label === "Customers" ? tourRefs.customersNavRef : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive(item.path)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              {isActive(item.path) && (
                <ChevronRight className="w-4 h-4 ml-auto" />
              )}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => base44.auth.logout()}
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border h-16 flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 mx-auto">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Wrench className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-foreground">PipeFlow</span>
        </div>
        <div className="w-10" />
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/50 z-50"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="lg:hidden fixed inset-y-0 left-0 w-72 bg-sidebar z-50 shadow-2xl"
            >
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-sidebar-primary-foreground" />
                  </div>
                  <h1 className="font-display text-lg font-bold text-sidebar-foreground">PipeFlow</h1>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="text-sidebar-foreground">
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <nav className="px-3 space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive(item.path)
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sidebar-foreground/50"
                  onClick={() => base44.auth.logout()}
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign Out
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet context={tourRefs} />
        </div>
      </main>

      <TourOverlay refs={tourRefs} />
    </div>
  );
}