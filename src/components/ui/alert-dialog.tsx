"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

function AlertDialogContent({
  children,
  className,
  size = "sm",
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent size={size} panelClassName={cn(className)} {...props}>
      {children}
    </DialogContent>
  );
}

function AlertDialogHeader({ children, ...props }: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader {...props}>{children}</DialogHeader>;
}

function AlertDialogTitle({ children, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props}>{children}</DialogTitle>;
}

function AlertDialogDescription({ children, ...props }: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription {...props}>{children}</DialogDescription>;
}

function AlertDialogFooter({ children, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter {...props}>{children}</DialogFooter>;
}

function AlertDialogCancel({ children, onClick, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button 
      type="button" 
      variant="outline" 
      onClick={onClick} 
      className="rounded-full px-4 py-2 font-medium transition-all duration-200 hover:shadow-md"
      {...props}
    >
      {children}
    </Button>
  );
}

function AlertDialogAction({ children, onClick, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button 
      type="button" 
      onClick={onClick} 
      className="rounded-full px-4 py-2 font-medium transition-all duration-200 hover:shadow-md"
      {...props}
    >
      {children}
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
};
