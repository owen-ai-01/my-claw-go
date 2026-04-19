'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Download,
  Eraser,
  Grid3x3,
  Image as ImageIcon,
  Palette,
  Upload,
  X,
} from 'lucide-react';
import { Lock, LogIn, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

interface BackgroundToolsProps {
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  showGrid: boolean;
  isEraserMode?: boolean;
  eraserSize?: number;
  onBackgroundColorChange: (color: string | null) => void;
  onBackgroundImageChange: (url: string | null) => void;
  onShowGridChange: (show: boolean) => void;
  onEraserModeChange?: (enabled: boolean) => void;
  onEraserSizeChange?: (size: number) => void;
  onDownloadTransparent: () => void;
  onDownloadWithBackground: (highQuality?: boolean) => void;
  isLoggedIn?: boolean;
  hasCredits?: boolean;
}

const PRESET_COLORS = [
  { nameKey: 'white', value: '#ffffff' },
  { nameKey: 'black', value: '#000000' },
  { nameKey: 'gray', value: '#808080' },
  { nameKey: 'blue', value: '#3b82f6' },
  { nameKey: 'green', value: '#10b981' },
];

export function BackgroundTools({
  backgroundColor,
  backgroundImageUrl,
  showGrid,
  isEraserMode = false,
  eraserSize = 20,
  onBackgroundColorChange,
  onBackgroundImageChange,
  onShowGridChange,
  onEraserModeChange,
  onEraserSizeChange,
  onDownloadTransparent,
  onDownloadWithBackground,
  isLoggedIn = false,
  hasCredits = false,
}: BackgroundToolsProps) {
  const t = useTranslations('ImageEditor.backgroundTools');
  const [customColor, setCustomColor] = useState('#ffffff');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to get color translation
  const getColorLabel = (nameKey: string): string => {
    const colorMap: Record<string, string> = {
      white: t('colors.white'),
      black: t('colors.black'),
      gray: t('colors.gray'),
      blue: t('colors.blue'),
      green: t('colors.green'),
    };
    return colorMap[nameKey] || nameKey;
  };

  const handlePresetColorClick = (color: string) => {
    if (backgroundColor === color) {
      // Toggle off if same color clicked
      onBackgroundColorChange(null);
    } else {
      onBackgroundColorChange(color);
      onBackgroundImageChange(null); // Clear background image when setting color
    }
  };

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
    onBackgroundColorChange(color);
    onBackgroundImageChange(null); // Clear background image when setting color
  };

  const handleBackgroundImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(t('invalidImageFile'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onBackgroundImageChange(result);
      onBackgroundColorChange(null); // Clear color when setting image
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveBackgroundImage = () => {
    onBackgroundImageChange(null);
  };

  return (
    <TooltipProvider>
      <div className="w-full flex flex-col gap-4 p-2">
        {/* Top Row: Main Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Background Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Preset Colors */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                {t('backgroundColor')}
              </span>
              {PRESET_COLORS.map((preset) => (
                <Tooltip key={preset.value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handlePresetColorClick(preset.value)}
                      className={cn(
                        'w-8 h-8 rounded-full border shadow-sm transition-all hover:scale-110 cursor-pointer',
                        backgroundColor === preset.value
                          ? 'border-primary ring-2 ring-primary ring-offset-2'
                          : 'border-transparent hover:border-black/10'
                      )}
                      style={{ backgroundColor: preset.value }}
                      aria-label={getColorLabel(preset.nameKey)}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{getColorLabel(preset.nameKey)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            <div className="h-8 w-px bg-border mx-2" />

            {/* Custom Color */}
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8 rounded-full overflow-hidden border shadow-sm cursor-pointer hover:scale-105 transition-transform">
                <Input
                  type="color"
                  value={customColor}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 p-0 border-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="h-8 w-px bg-border mx-2" />

            {/* Background Image */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackgroundImageUpload}
                className="hidden"
              />
              {backgroundImageUrl ? (
                <div className="relative group">
                  <div className="w-12 h-8 rounded-md overflow-hidden border shadow-sm relative">
                    <img
                      src={backgroundImageUrl}
                      alt="Bg"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveBackgroundImage}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs gap-1.5 h-8 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('uploadBackgroundImage')}
                </Button>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Eraser Toggle */}
            {onEraserModeChange && (
              <Button
                variant={isEraserMode ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onEraserModeChange(!isEraserMode)}
                className={cn(
                  'h-8 gap-2 cursor-pointer',
                  isEraserMode && 'text-primary'
                )}
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isEraserMode ? t('disableEraser') : t('enableEraser')}
                </span>
              </Button>
            )}

            {/* Download */}
            <div className="flex items-center gap-1 ml-2">
              <Button
                size="sm"
                onClick={() => onDownloadWithBackground(false)}
                variant="outline"
                className="h-8 hidden sm:flex cursor-pointer"
              >
                <span className="text-xs">Preview</span>
              </Button>
              <Button
                size="sm"
                onClick={() => onDownloadWithBackground(true)}
                className="h-8 gap-2 shadow-sm cursor-pointer"
                disabled={isLoggedIn && hasCredits === false}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t('downloadHD')}</span>
                {(!isLoggedIn || !hasCredits) && (
                  <Sparkles className="w-3 h-3 text-yellow-300 ml-0.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Second Row: Eraser Settings (Conditional) */}
        {isEraserMode && onEraserSizeChange && (
          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border/50 animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {t('eraser')} {t('size')}: {eraserSize}px
            </span>
            <Input
              type="range"
              min="5"
              max="100"
              value={eraserSize}
              onChange={(e) => onEraserSizeChange(Number(e.target.value))}
              className="w-full max-w-[200px] h-8"
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
