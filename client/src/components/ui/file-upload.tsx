import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";

interface FileUploadProps {
  label: string;
  name: string;
  accept?: string;
  value?: string;
  onChange?: (file: File | null) => void;
  disabled?: boolean;
}

export function FileUpload({
  label,
  name,
  accept = "image/*,.pdf",
  value,
  onChange,
  disabled = false,
}: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(value || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
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
    onChange?.(null);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex flex-col gap-2">
        {preview && (
          <div className="relative w-full max-w-[200px] aspect-square">
            {preview.startsWith('data:image') ? (
              <img 
                src={preview} 
                alt={label}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">PDF Document</p>
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
        </div>
      </div>
    </div>
  );
}
