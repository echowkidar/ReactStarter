import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "./badge"

export interface Option {
  label: string
  value: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (selectedValues: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  hideSelectAll?: boolean
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select options",
  className,
  disabled = false,
  hideSelectAll = false,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  const handleSelect = (value: string) => {
    setIsOpen(true)
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const handleRemove = (value: string) => {
    if (disabled) return
    onChange(selected.filter((item) => item !== value))
  }

  const selectedOptions = options.filter((option) =>
    selected.includes(option.value)
  )

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle clicks outside to close dropdown
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          className
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex flex-1 items-center gap-1 overflow-hidden">
          {selectedOptions.length > 0 ? (
            selectedOptions.length > 2 ? (
              <Badge variant="secondary" className="font-normal rounded-sm">
                {selectedOptions.length} options selected
              </Badge>
            ) : (
              <div className="flex gap-1 overflow-hidden">
                {selectedOptions.map((option) => (
                  <Badge key={option.value} variant="secondary" className="flex items-center gap-1 font-normal rounded-sm truncate max-w-[150px]">
                    <span className="truncate">{option.label}</span>
                    <X
                      className="h-3 w-3 shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(option.value)
                      }}
                    />
                  </Badge>
                ))}
              </div>
            )
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="sticky top-0 z-10 bg-popover border-b shadow-sm pb-1">
            <div className="p-2">
              <input
                type="text"
                className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {filteredOptions.length > 0 && !hideSelectAll && (
              <div className="px-1">
                <div
                  className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm font-semibold outline-none hover:bg-accent text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    const visibleValues = filteredOptions.map(o => o.value);
                    const allSelected = visibleValues.every(v => selected.includes(v));

                    if (allSelected) {
                      // Unselect visible
                      onChange(selected.filter(v => !visibleValues.includes(v)));
                    } else {
                      // Select visible (keep currently selected)
                      const newSelected = new Set([...selected, ...visibleValues]);
                      onChange(Array.from(newSelected));
                    }
                  }}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-primary">
                      {filteredOptions.every(v => selected.includes(v.value)) && <Check className="h-3 w-3" />}
                    </div>
                  </span>
                  {filteredOptions.every(v => selected.includes(v.value)) ? "Unselect All" : "Select All"}
                </div>
              </div>
            )}
          </div>

          {filteredOptions.length === 0 ? (
            <div className="py-2 px-2 text-sm text-muted-foreground text-center">
              No options found
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className={cn(
                  "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  selected.includes(option.value) ? "bg-accent text-accent-foreground" : ""
                )}
                onClick={() => handleSelect(option.value)}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {selected.includes(option.value) && <Check className="h-4 w-4" />}
                </span>
                {option.label}
              </div>
            ))
          )}
        </div>
      )
      }
    </div >
  )
} 