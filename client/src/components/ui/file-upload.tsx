import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, AlertTriangle } from "lucide-react";
import { isImageFile } from "@/lib/image-utils";

interface FileUploadProps {
  label: string;
  name: string;
  accept?: string;
  value?: string;
  onChange?: (file: File | null) => void;
  onRemove?: () => void;
  disabled?: boolean;
  onlyImages?: boolean;
  errorMessage?: string;
}

export function FileUpload({
  label,
  name,
  accept = "image/*",
  value,
  onChange,
  onRemove,
  disabled = false,
  onlyImages = true,
  errorMessage,
}: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(value || null);
  const [error, setError] = useState<string | null>(errorMessage || null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update preview when value changes
  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type if onlyImages is true
      if (onlyImages && !isImageFile(file)) {
        setError("Only image files are allowed");
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        return;
      }
      
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onChange?.(file);
    }
  };

  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setPreview(null);
    setError(null);
    onChange?.(null);
    onRemove?.();
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex flex-col gap-2">
        {preview && (
          <div className="relative w-full max-w-[200px] aspect-square">
            {preview.startsWith('data:image') || preview.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
              <img 
                src={preview} 
                alt={label}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Document</p>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {error && (
          <div className="flex items-center text-destructive gap-1 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="file"
            id={name}
            name={name}
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload {label}
          </Button>
          {onlyImages && (
            <p className="text-xs text-muted-foreground">Only image files are allowed</p>
          )}
        </div>
      </div>
    </div>
  );
}
