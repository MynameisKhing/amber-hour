package handler

import (
	"bytes"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"math"
)

// maxImageDim is the longest-edge cap (px) for stored images. Uploads larger
// than this are downscaled before hitting the NFS-backed upload volume, which
// keeps disk usage and download bandwidth sane.
const maxImageDim = 1600

// jpegQuality balances size against visible artefacts for re-encoded photos.
const jpegQuality = 85

// resizeIfLarge downscales JPEG/PNG uploads whose longest edge exceeds
// maxImageDim, returning the bytes to persist and the file extension to use.
// Formats it can't safely round-trip (GIF, WebP, SVG, …) are passed through
// untouched so animation and vector data are preserved.
func resizeIfLarge(raw []byte, mime string) ([]byte, string) {
	isJPEG := mime == "image/jpeg"
	isPNG := mime == "image/png"
	if !isJPEG && !isPNG {
		return raw, extForMime(mime)
	}

	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return raw, extForMime(mime) // undecodable — store original
	}

	b := img.Bounds()
	if b.Dx() <= maxImageDim && b.Dy() <= maxImageDim {
		return raw, extForMime(mime) // already within bounds
	}

	nw, nh := scaledDims(b.Dx(), b.Dy(), maxImageDim)
	dst := resizeBilinear(img, nw, nh)

	var buf bytes.Buffer
	if isPNG {
		if png.Encode(&buf, dst) == nil {
			return buf.Bytes(), ".png"
		}
		return raw, ".png"
	}
	if jpeg.Encode(&buf, dst, &jpeg.Options{Quality: jpegQuality}) == nil {
		return buf.Bytes(), ".jpg"
	}
	return raw, ".jpg"
}

func extForMime(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ".img"
	}
}

// scaledDims returns the target dimensions that fit within max on the longest
// edge while preserving aspect ratio.
func scaledDims(w, h, max int) (int, int) {
	if w >= h {
		nh := h * max / w
		if nh < 1 {
			nh = 1
		}
		return max, nh
	}
	nw := w * max / h
	if nw < 1 {
		nw = 1
	}
	return nw, max
}

// resizeBilinear downscales src into a new nw×nh RGBA image using bilinear
// sampling — no third-party dependencies, good enough quality for chat images.
func resizeBilinear(src image.Image, nw, nh int) *image.RGBA {
	sb := src.Bounds()
	sw, sh := sb.Dx(), sb.Dy()

	// Normalise the source into a 0,0-origin RGBA buffer for fast pixel access.
	srcRGBA := image.NewRGBA(image.Rect(0, 0, sw, sh))
	draw.Draw(srcRGBA, srcRGBA.Bounds(), src, sb.Min, draw.Src)

	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	xRatio := float64(sw) / float64(nw)
	yRatio := float64(sh) / float64(nh)

	for dy := 0; dy < nh; dy++ {
		fy := (float64(dy)+0.5)*yRatio - 0.5
		y0 := int(math.Floor(fy))
		wy := fy - float64(y0)
		y1 := clamp(y0+1, 0, sh-1)
		y0 = clamp(y0, 0, sh-1)

		for dx := 0; dx < nw; dx++ {
			fx := (float64(dx)+0.5)*xRatio - 0.5
			x0 := int(math.Floor(fx))
			wx := fx - float64(x0)
			x1 := clamp(x0+1, 0, sw-1)
			x0 = clamp(x0, 0, sw-1)

			di := dst.PixOffset(dx, dy)
			for ch := 0; ch < 4; ch++ {
				c00 := float64(srcRGBA.Pix[srcRGBA.PixOffset(x0, y0)+ch])
				c10 := float64(srcRGBA.Pix[srcRGBA.PixOffset(x1, y0)+ch])
				c01 := float64(srcRGBA.Pix[srcRGBA.PixOffset(x0, y1)+ch])
				c11 := float64(srcRGBA.Pix[srcRGBA.PixOffset(x1, y1)+ch])
				top := c00*(1-wx) + c10*wx
				bot := c01*(1-wx) + c11*wx
				dst.Pix[di+ch] = uint8(math.Round(top*(1-wy) + bot*wy))
			}
		}
	}
	return dst
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
