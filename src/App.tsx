import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Slider } from './components/ui/slider'

type DownloadMode = 'png' | 'jpg' | 'webp' | 'svg' | 'json'
type VideoFormat = 'webm' | 'mp4'

const DOWNLOAD_MODES: { value: DownloadMode; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WEBP' },
  { value: 'svg', label: 'SVG' },
  { value: 'json', label: 'JSON' },
]

const VIDEO_FORMATS: { value: VideoFormat; label: string }[] = [
  { value: 'webm', label: 'WEBM' },
  { value: 'mp4', label: 'MP4' },
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const smallCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pixelDataRef = useRef<ImageData | null>(null)
  const animationRef = useRef<number | null>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [sourceWidth, setSourceWidth] = useState(0)
  const [sourceHeight, setSourceHeight] = useState(0)
  const [targetWidth, setTargetWidth] = useState(96)
  const [borderSize, setBorderSize] = useState(1)
  const [cellSize, setCellSize] = useState(10)
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('png')
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('webm')
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const targetHeight = useMemo(() => {
    if (!sourceWidth || !sourceHeight) return 0
    return Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth))
  }, [sourceHeight, sourceWidth, targetWidth])

  const supportedVideoMimes = useMemo(() => {
    if (typeof MediaRecorder === 'undefined') {
      return { webm: null, mp4: null }
    }

    const pick = (candidates: string[]) =>
      candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null

    return {
      webm: pick(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']),
      mp4: pick([
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
      ]),
    }
  }, [])

  const drawPixelFrame = useCallback(() => {
    const video = videoRef.current
    const outputCanvas = canvasRef.current
    if (!video || !outputCanvas || !isReady) return

    const width = Math.max(1, targetWidth)
    const height = Math.max(1, targetHeight)

    let smallCanvas = smallCanvasRef.current
    if (!smallCanvas) {
      smallCanvas = document.createElement('canvas')
      smallCanvasRef.current = smallCanvas
    }

    smallCanvas.width = width
    smallCanvas.height = height

    const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true })
    if (!smallCtx) return

    smallCtx.drawImage(video, 0, 0, width, height)
    const pixelData = smallCtx.getImageData(0, 0, width, height)
    pixelDataRef.current = pixelData

    const outputWidth = width * cellSize + (width + 1) * borderSize
    const outputHeight = height * cellSize + (height + 1) * borderSize

    outputCanvas.width = outputWidth
    outputCanvas.height = outputHeight

    const outputCtx = outputCanvas.getContext('2d')
    if (!outputCtx) return

    outputCtx.fillStyle = '#ffffff'
    outputCtx.fillRect(0, 0, outputWidth, outputHeight)

    const data = pixelData.data
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]
        const a = data[index + 3] / 255

        outputCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`
        const drawX = borderSize + x * (cellSize + borderSize)
        const drawY = borderSize + y * (cellSize + borderSize)
        outputCtx.fillRect(drawX, drawY, cellSize, cellSize)
      }
    }
  }, [borderSize, cellSize, isReady, targetHeight, targetWidth])

  const stopLoop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  const startLoop = useCallback(() => {
    if (animationRef.current) return
    const loop = () => {
      drawPixelFrame()
      animationRef.current = requestAnimationFrame(loop)
    }
    animationRef.current = requestAnimationFrame(loop)
  }, [drawPixelFrame])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => startLoop()
    const handlePause = () => stopLoop()

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handlePause)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handlePause)
    }
  }, [startLoop, stopLoop])

  useEffect(() => {
    if (isReady) {
      drawPixelFrame()
    }
  }, [borderSize, cellSize, drawPixelFrame, isReady, targetWidth])

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setIsReady(false)
  }

  const handleVideoLoaded = () => {
    const video = videoRef.current
    if (!video) return
    setSourceWidth(video.videoWidth)
    setSourceHeight(video.videoHeight)
    setIsReady(true)
    drawPixelFrame()
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas || !pixelDataRef.current) return

    if (downloadMode === 'png' || downloadMode === 'jpg' || downloadMode === 'webp') {
      const typeMap: Record<DownloadMode, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        json: 'application/json',
      }
      const type = typeMap[downloadMode]
      const dataUrl = canvas.toDataURL(type, 0.92)
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `pixel-frame.${downloadMode === 'jpg' ? 'jpg' : downloadMode}`
      link.click()
      return
    }

    if (downloadMode === 'svg') {
      const { width, height } = pixelDataRef.current
      const svgWidth = width * cellSize + (width + 1) * borderSize
      const svgHeight = height * cellSize + (height + 1) * borderSize
      const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
        '<rect width="100%" height="100%" fill="#ffffff" />',
      ]
      const data = pixelDataRef.current.data
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4
          const r = data[index]
          const g = data[index + 1]
          const b = data[index + 2]
          const a = data[index + 3] / 255
          const drawX = borderSize + x * (cellSize + borderSize)
          const drawY = borderSize + y * (cellSize + borderSize)
          parts.push(
            `<rect x="${drawX}" y="${drawY}" width="${cellSize}" height="${cellSize}" fill="rgba(${r},${g},${b},${a})" />`
          )
        }
      }
      parts.push('</svg>')
      downloadBlob(new Blob([parts.join('')], { type: 'image/svg+xml' }), 'pixel-frame.svg')
      return
    }

    const pixelData = pixelDataRef.current
    const colors: number[] = []
    for (let i = 0; i < pixelData.data.length; i += 1) {
      colors.push(pixelData.data[i])
    }
    const payload = {
      source: { width: sourceWidth, height: sourceHeight },
      grid: { width: pixelData.width, height: pixelData.height },
      cellSize,
      borderSize,
      colors,
    }
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'pixel-frame.json')
  }

  const handleVideoExport = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !isReady || isExporting) return

    const mimeType = supportedVideoMimes[videoFormat]
    if (!mimeType) {
      setExportError(`${videoFormat.toUpperCase()} export is not supported in this browser.`)
      return
    }

    setExportError(null)
    setIsExporting(true)

    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }))
      }
    })

    const endedPromise = new Promise<void>((resolve) => {
      const handleEnded = () => {
        video.removeEventListener('ended', handleEnded)
        resolve()
      }
      video.addEventListener('ended', handleEnded)
    })

    try {
      video.currentTime = 0
      await video.play()
      recorder.start()
      await endedPromise
      recorder.stop()
      const blob = await stopPromise
      downloadBlob(blob, `pixel-video.${videoFormat}`)
    } catch (error) {
      setExportError('Video export failed. Try again after reloading the video.')
      console.error(error)
    } finally {
      stream.getTracks().forEach((track) => track.stop())
      setIsExporting(false)
    }
  }

  return (
    <div className="terminal-grid min-h-screen bg-[#0a0f0a] px-6 py-12 text-lime-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="space-y-2">
          <p className="text-xs uppercase text-lime-200/60">Video Pixelator</p>
          <h1 className="text-3xl font-semibold text-lime-100">Turn video frames into pixel art</h1>
          <p className="max-w-3xl text-sm text-lime-200/70">
            Upload a video, tweak the pixel grid, and export the current frame with crisp white borders
            between each pixel.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_1.45fr]">
          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>Load a clip and adjust the grid.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium uppercase  text-lime-200/70">
                  Video file
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="w-full border border-lime-200/30 bg-transparent px-3 py-2 text-sm text-lime-100 file:mr-4 file:border-0 file:bg-lime-200 file:px-3 file:py-1 file:text-xs file:font-semibold file:uppercase file:text-[#0a0f0a] hover:file:bg-lime-100"
                />
              </div>

              <div className="border border-lime-200/30 bg-[#0a110a] p-4 text-sm text-lime-200/80">
                <p className="font-medium uppercase  text-lime-100">Frame stats</p>
                <div className="mt-3 grid gap-2 text-[11px] uppercase text-lime-200/60">
                  <span>Source: {sourceWidth} x {sourceHeight}</span>
                  <span>Grid: {targetWidth} x {targetHeight || 0}</span>
                  <span>Output: {targetWidth * cellSize + (targetWidth + 1) * borderSize} x {targetHeight * cellSize + (targetHeight + 1) * borderSize}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm uppercase  text-lime-200/70">
                  <span>Pixel columns</span>
                  <span className="text-lime-100">{targetWidth}</span>
                </div>
                <Slider
                  value={[targetWidth]}
                  min={16}
                  max={256}
                  step={1}
                  onValueChange={(value) => setTargetWidth(clamp(value[0], 16, 256))}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm uppercase  text-lime-200/70">
                  <span>Cell size</span>
                  <span className="text-lime-100">{cellSize}px</span>
                </div>
                <Slider
                  value={[cellSize]}
                  min={4}
                  max={24}
                  step={1}
                  onValueChange={(value) => setCellSize(clamp(value[0], 4, 24))}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm uppercase text-lime-200/70">
                  <span>Border size</span>
                  <span className="text-lime-100">{borderSize}px</span>
                </div>
                <Slider
                  value={[borderSize]}
                  min={0}
                  max={6}
                  step={1}
                  onValueChange={(value) => setBorderSize(clamp(value[0], 0, 6))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium uppercase  text-lime-200/70">
                  Download mode
                </label>
                <select
                  value={downloadMode}
                  onChange={(event) => setDownloadMode(event.target.value as DownloadMode)}
                  className="w-full border border-lime-200/30 bg-transparent px-3 py-2 text-sm text-lime-100"
                >
                  {DOWNLOAD_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button onClick={handleDownload} disabled={!isReady} className="w-full">
                Download current frame
              </Button>

              <div className="space-y-2">
                <label className="text-sm font-medium uppercase  text-lime-200/70">
                  Video export
                </label>
                <select
                  value={videoFormat}
                  onChange={(event) => setVideoFormat(event.target.value as VideoFormat)}
                  className="w-full border border-lime-200/30 bg-transparent px-3 py-2 text-sm text-lime-100"
                >
                  {VIDEO_FORMATS.map((format) => (
                    <option
                      key={format.value}
                      value={format.value}
                      disabled={!supportedVideoMimes[format.value]}
                    >
                      {format.label}
                    </option>
                  ))}
                </select>
                {exportError ? (
                  <p className="text-xs text-rose-200">{exportError}</p>
                ) : (
                  <p className="text-xs text-lime-200/60">
                    Exports the full video duration using the current pixel settings.
                  </p>
                )}
              </div>

              <Button
                onClick={handleVideoExport}
                disabled={!isReady || isExporting || !supportedVideoMimes[videoFormat]}
                variant="outline"
                className="w-full"
              >
                {isExporting ? 'Exporting video…' : 'Export pixelated video'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Play the video to update the pixelated frame.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border border-lime-200/30 bg-[#0a110a] p-3">
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  onLoadedMetadata={handleVideoLoaded}
                  controls
                  className="h-auto w-full border border-lime-200/30"
                />
              </div>

              <div className="border border-lime-200/30 bg-[#0a110a] p-4">
                {isReady ? (
                  <canvas ref={canvasRef} className="max-w-full shadow-[0_0_30px_rgba(231,247,179,0.15)]" />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-lime-200/60">
                    Upload a video to generate the pixelated frame.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
