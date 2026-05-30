import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/upload/route";

// Mock Supabase client
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

const mockFrom = vi.fn(() => ({
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      storage: {
        from: mockFrom,
      },
    })
  ),
}));

function createMockFile(
  content: string,
  name: string,
  type: string,
  size?: number
): File {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

function createFormDataRequest(file: File): Request {
  const formData = new FormData();
  formData.append("file", file);
  return new Request("http://localhost:3000/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a valid JPEG file and returns public URL", async () => {
    const file = createMockFile("fake-image-data", "photo.jpg", "image/jpeg");
    const request = createFormDataRequest(file);

    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.supabase.co/menu-photos/test.jpg" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe(
      "https://storage.supabase.co/menu-photos/test.jpg"
    );
    expect(mockFrom).toHaveBeenCalledWith("menu-photos");
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+\.jpg$/),
      expect.any(Uint8Array),
      { contentType: "image/jpeg", upsert: false }
    );
  });

  it("uploads a valid PNG file", async () => {
    const file = createMockFile("fake-png-data", "photo.png", "image/png");
    const request = createFormDataRequest(file);

    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.supabase.co/menu-photos/test.png" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBeDefined();
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+\.png$/),
      expect.any(Uint8Array),
      { contentType: "image/png", upsert: false }
    );
  });

  it("uploads a valid WebP file", async () => {
    const file = createMockFile("fake-webp-data", "photo.webp", "image/webp");
    const request = createFormDataRequest(file);

    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.supabase.co/menu-photos/test.webp" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBeDefined();
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+\.webp$/),
      expect.any(Uint8Array),
      { contentType: "image/webp", upsert: false }
    );
  });

  it("rejects request with no file", async () => {
    const formData = new FormData();
    const request = new Request("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("No file provided");
  });

  it("rejects invalid file type (GIF)", async () => {
    const file = createMockFile("fake-gif-data", "photo.gif", "image/gif");
    const request = createFormDataRequest(file);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid file type");
    expect(body.error).toContain("JPEG, PNG, WebP");
  });

  it("rejects invalid file type (PDF)", async () => {
    const file = createMockFile("fake-pdf-data", "doc.pdf", "application/pdf");
    const request = createFormDataRequest(file);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid file type");
  });

  it("rejects file exceeding 10MB", async () => {
    // Create a File with a size property that exceeds 10MB
    // We need to mock the request.formData() to return a file-like object with large size
    const fakeFile = {
      name: "large.jpg",
      type: "image/jpeg",
      size: 11 * 1024 * 1024,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      [Symbol.toStringTag]: "File",
    };

    // Ensure instanceof File check passes
    Object.setPrototypeOf(fakeFile, File.prototype);

    const mockFd = {
      get: (key: string) => (key === "file" ? fakeFile : null),
    } as unknown as FormData;

    const request = {
      formData: () => Promise.resolve(mockFd),
    } as unknown as Request;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("File too large");
    expect(body.error).toContain("10 MB");
  });

  it("returns 500 when Supabase upload fails", async () => {
    const file = createMockFile("fake-image-data", "photo.jpg", "image/jpeg");
    const request = createFormDataRequest(file);

    mockUpload.mockResolvedValue({
      error: { message: "Storage error" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("Failed to upload file");
  });

  it("generates unique filenames with correct extension", async () => {
    const file = createMockFile("fake-image-data", "photo.jpg", "image/jpeg");
    const request1 = createFormDataRequest(file);
    const request2 = createFormDataRequest(file);

    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.supabase.co/menu-photos/test.jpg" },
    });

    await POST(request1);
    await POST(request2);

    const firstFilename = mockUpload.mock.calls[0][0];
    const secondFilename = mockUpload.mock.calls[1][0];

    // Filenames should be different (UUID-based)
    expect(firstFilename).not.toBe(secondFilename);
    // Both should end with .jpg
    expect(firstFilename).toMatch(/\.jpg$/);
    expect(secondFilename).toMatch(/\.jpg$/);
  });
});
