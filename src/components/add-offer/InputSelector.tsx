"use client";

import * as React from "react";
import { Link2, FileText, Camera, Upload, Loader2, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type InputType = "link" | "text" | "photo";

export interface InputSubmission {
  type: InputType;
  value: string;
}

export interface InputSelectorProps {
  onSubmit: (submission: InputSubmission) => void;
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_TEXT_LENGTH = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.webp";

// ============================================================================
// Component
// ============================================================================

export function InputSelector({
  onSubmit,
  isLoading = false,
  className,
}: InputSelectorProps) {
  const [activeTab, setActiveTab] = React.useState<InputType>("link");

  return (
    <div className={cn("w-full", className)}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as InputType)}
      >
        <TabsList className="w-full">
          <TabsTrigger value="link" disabled={isLoading}>
            <Link2 className="size-4" aria-hidden="true" />
            Link
          </TabsTrigger>
          <TabsTrigger value="text" disabled={isLoading}>
            <FileText className="size-4" aria-hidden="true" />
            Tekst
          </TabsTrigger>
          <TabsTrigger value="photo" disabled={isLoading}>
            <Camera className="size-4" aria-hidden="true" />
            Zdjęcie
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {isLoading && <LoadingState />}
          <fieldset disabled={isLoading} hidden={isLoading}>
            <TabsContent value="link" forceMount hidden={activeTab !== "link"}>
              <LinkInput onSubmit={onSubmit} />
            </TabsContent>
            <TabsContent value="text" forceMount hidden={activeTab !== "text"}>
              <TextInput onSubmit={onSubmit} />
            </TabsContent>
            <TabsContent value="photo" forceMount hidden={activeTab !== "photo"}>
              <PhotoInput onSubmit={onSubmit} />
            </TabsContent>
          </fieldset>
        </div>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Link Input
// ============================================================================

function LinkInput({ onSubmit }: { onSubmit: (s: InputSubmission) => void }) {
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function validateUrl(value: string): string | null {
    if (!value.trim()) {
      return "URL jest wymagany.";
    }
    if (!/^https?:\/\//i.test(value.trim())) {
      return "URL musi zaczynać się od http:// lub https://";
    }
    try {
      new URL(value.trim());
    } catch {
      return "Podany URL jest nieprawidłowy.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSubmit({ type: "link", value: url.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="url-input" className="text-sm font-medium text-foreground">
        Wklej link do strony z menu
      </label>
      <Input
        id="url-input"
        type="url"
        placeholder="https://restauracja.pl/menu-lunchowe"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? "url-error" : undefined}
      />
      {error && (
        <p id="url-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="self-start">
        Analizuj
      </Button>
    </form>
  );
}

// ============================================================================
// Text Input
// ============================================================================

function TextInput({ onSubmit }: { onSubmit: (s: InputSubmission) => void }) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_TEXT_LENGTH;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Tekst jest wymagany.");
      return;
    }
    if (isOverLimit) {
      setError(`Tekst przekracza maksymalną długość ${MAX_TEXT_LENGTH} znaków.`);
      return;
    }
    setError(null);
    onSubmit({ type: "text", value: text.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="text-input" className="text-sm font-medium text-foreground">
        Wklej tekst z ofertą lunchową
      </label>
      <Textarea
        id="text-input"
        placeholder="Wklej tutaj treść menu lub oferty lunchowej..."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        rows={6}
        aria-invalid={!!error || isOverLimit}
        aria-describedby="text-counter text-error"
      />
      <div className="flex items-center justify-between">
        <p
          id="text-counter"
          className={cn(
            "text-xs",
            isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
          )}
        >
          {charCount} / {MAX_TEXT_LENGTH} znaków
        </p>
      </div>
      {error && (
        <p id="text-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={isOverLimit}>
        Analizuj
      </Button>
    </form>
  );
}

// ============================================================================
// Photo Input
// ============================================================================

function PhotoInput({ onSubmit }: { onSubmit: (s: InputSubmission) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function validateFile(f: File): string | null {
    if (!ALLOWED_FILE_TYPES.includes(f.type)) {
      return "Niedozwolony format pliku. Dozwolone: JPEG, PNG, WebP.";
    }
    if (f.size > MAX_FILE_SIZE) {
      return `Plik jest za duży (${(f.size / (1024 * 1024)).toFixed(1)} MB). Maksymalny rozmiar to 10 MB.`;
    }
    return null;
  }

  function handleFileSelect(f: File) {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      setPreview(null);
      return;
    }

    setError(null);
    setFile(f);

    // Create preview
    const objectUrl = URL.createObjectURL(f);
    setPreview(objectUrl);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }

  function clearFile() {
    setFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Wybierz zdjęcie do analizy.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Nie udało się przesłać pliku. Spróbuj ponownie.");
        return;
      }

      const { url } = await response.json();
      onSubmit({ type: "photo", value: url });
    } catch {
      setError("Wystąpił błąd podczas przesyłania pliku. Spróbuj ponownie.");
    } finally {
      setIsUploading(false);
    }
  }

  // Cleanup preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-foreground">
        Prześlij zdjęcie menu lub oferty
      </label>

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Przeciągnij i upuść zdjęcie lub kliknij, aby wybrać plik"
          className={cn(
            "flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50",
            error && "border-destructive"
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Przeciągnij i upuść zdjęcie
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              lub kliknij, aby wybrać plik
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG lub WebP • maks. 10 MB
          </p>
        </div>
      ) : (
        <div className="relative rounded-lg border border-border overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview || ""}
            alt="Podgląd przesłanego zdjęcia"
            className="w-full max-h-[300px] object-contain bg-muted/30"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            className="absolute top-2 right-2"
            onClick={clearFile}
            aria-label="Usuń zdjęcie"
          >
            <X className="size-3" />
          </Button>
          <div className="p-2 bg-muted/50 text-xs text-muted-foreground truncate">
            {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="self-start"
        disabled={!file || isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Przesyłanie...
          </>
        ) : (
          "Analizuj"
        )}
      </Button>
    </form>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-12"
      role="status"
      aria-label="Trwa analiza AI"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          Analizuję dane...
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          AI przetwarza przesłane informacje
        </p>
      </div>
    </div>
  );
}
