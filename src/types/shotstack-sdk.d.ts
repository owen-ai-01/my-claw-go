// Type declaration for shotstack-sdk
declare module 'shotstack-sdk' {
  // API Client configuration
  export class ApiClient {
    static instance: ApiClient;
    basePath: string;
    authentications: {
      DeveloperKey: {
        apiKey: string;
      };
    };
  }

  // Edit API
  export class EditApi {
    postRender(edit: Edit): Promise<RenderResponse>;
    getRender(id: string): Promise<StatusResponse>;
  }

  export class Edit {
    setTimeline(timeline: Timeline): this;
    setOutput(output: Output): this;
  }

  export class Timeline {
    setTracks(tracks: Track[]): this;
    setBackground(color: string): this;
  }

  export class Track {
    setClips(clips: Clip[]): this;
  }

  export class Clip {
    setAsset(asset: Asset): this;
    setStart(start: number): this;
    setLength(length: number | 'auto'): this;
    setTransition(transition: Transition): this;
  }

  export class Transition {
    setIn(effect: string): this;
    setOut(effect: string): this;
  }

  export class ImageAsset {
    setSrc(src: string): this;
  }

  export class LumaAsset {
    setType(type: string): this;
    setProvider(provider: string): this;
    setVoice(voice: string): this;
    setText(text: string): this;
  }

  export class TitleAsset {
    setText(text: string): this;
    setStyle(style: string): this;
    setPosition(position: string): this;
    setSize(size: string): this;
  }

  export class AudioAsset {
    setSrc(src: string): this;
    setVolume(volume: number): this;
    setTrim(trim: number): this;
  }

  export class Output {
    setFormat(format: string): this;
    setResolution(resolution: string): this;
    setAspectRatio(ratio: string): this;
  }

  type Asset = ImageAsset | LumaAsset | TitleAsset | AudioAsset;

  // 响应接口 - 支持两种可能的结构
  interface RenderResponse {
    // 直接响应属性（新版SDK）
    response?: {
      id?: string;
    };
    // 嵌套数据结构（旧版SDK）
    data?: {
      response?: {
        id?: string;
      };
    };
  }

  interface StatusResponse {
    // 直接响应属性（新版SDK）
    response?: {
      status?: string;
      url?: string;
      error?: string;
      data?: {
        progress?: number;
      };
    };
    // 嵌套数据结构（旧版SDK）
    data?: {
      response?: {
        status?: string;
        url?: string;
        error?: string;
        data?: {
          progress?: number;
        };
      };
    };
  }

  // Default export contains all exports
  const Shotstack: {
    ApiClient: typeof ApiClient;
    EditApi: typeof EditApi;
    Edit: typeof Edit;
    Timeline: typeof Timeline;
    Track: typeof Track;
    Clip: typeof Clip;
    Transition: typeof Transition;
    ImageAsset: typeof ImageAsset;
    LumaAsset: typeof LumaAsset;
    TitleAsset: typeof TitleAsset;
    Output: typeof Output;
  };

  export default Shotstack;
}
