import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Subscription } from 'rxjs';
import { PromiseUtils } from '../../../../common/utils/promise-utils';
import { TrackModel } from '../../../../services/track/track-model';
import { LyricsModel } from '../../../../services/lyrics/lyrics-model';
import { LyricsSourceType } from '../../../../common/api/lyrics/lyrics-source-type';
import { PlaybackInformation } from '../../../../services/playback-information/playback-information';
import { AppearanceServiceBase } from '../../../../services/appearance/appearance.service.base';
import { LyricsServiceBase } from '../../../../services/lyrics/lyrics.service.base';
import { StringUtils } from '../../../../common/utils/string-utils';
import { PlaybackInformationService } from '../../../../services/playback-information/playback-information.service';
import { SettingsBase } from '../../../../common/settings/settings.base';

// 定义每一行歌词的结构
interface LyricLine {
  time: number; // 秒
  text: string; // 歌词文本
}
@Component({
    selector: 'app-now-playing-lyrics',
    host: { style: 'display: block; width: 100%; height: 100%;' },
    templateUrl: './now-playing-lyrics.component.html',
    styleUrls: ['./now-playing-lyrics.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class NowPlayingLyricsComponent implements OnInit, OnDestroy {
    // --- 粘贴到类里面，变量定义的区域 ---
  
  // 存储解析后的歌词数组
  public parsedLyrics: LyricLine[] = [];
  
  // 当前正在唱的那一行索引
  public currentLineIndex: number = -1;

// ---------------------------------
    private subscription: Subscription = new Subscription();
    private _lyrics: LyricsModel | undefined;
    private previousTrackPath: string = '';
    private _isBusy: boolean = false;

    public constructor(
        private appearanceService: AppearanceServiceBase,
        private playbackInformationService: PlaybackInformationService,
        private lyricsService: LyricsServiceBase,
        public settings: SettingsBase,
    ) {}

    public lyricsSourceTypeEnum: typeof LyricsSourceType = LyricsSourceType;

    public largeFontSize: number = this.appearanceService.selectedFontSize * 1.7;
    public smallFontSize: number = this.appearanceService.selectedFontSize;

    public get isBusy(): boolean {
        return this._isBusy;
    }

    public get hasLyrics(): boolean {
        return this._lyrics != undefined && !StringUtils.isNullOrWhiteSpace(this._lyrics.text);
    }

    public get lyrics(): LyricsModel | undefined {
        return this._lyrics;
    }

    public ngOnDestroy(): void {
        this.destroySubscriptions();
        // --- 粘贴到类的最下方 ---

  // 1. 解析 LRC 歌词的方法
  private parseLrc(lrcText: string | undefined): void {
    this.parsedLyrics = [];
    this.currentLineIndex = -1;
    
    if (!lrcText) return;

    // 正则表达式匹配 [00:12.34] 格式
    const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
    const lines = lrcText.split('\n');

    for (const line of lines) {
      const match = line.trim().match(regex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3], 10);
        
        // 算出这一句对应的总秒数
        const time = minutes * 60 + seconds + milliseconds / 1000;
        const text = match[4].trim();
        
        // 只有文本不为空才加进去（或者看你喜好保留空行）
        if (text) {
          this.parsedLyrics.push({ time, text });
        }
      }
    }
  }

  // 2. 根据时间同步歌词的方法
  private syncLyrics(currentTime: number): void {
    if (this.parsedLyrics.length === 0) return;

    // 找到 第一个 时间大于当前时间 的行
    const nextIndex = this.parsedLyrics.findIndex(line => line.time > currentTime);

    // 如果找到了，那当前行就是它前面那一行 (nextIndex - 1)
    // 如果没找到 (nextIndex == -1)，说明已经唱到最后一句了，取最后一行
    let activeIndex = (nextIndex === -1) ? this.parsedLyrics.length - 1 : nextIndex - 1;

    // 修正一下，防止变成 -1
    if (activeIndex < 0) activeIndex = 0;

    // 如果行号变了，才执行滚动，节省性能
    if (activeIndex !== this.currentLineIndex) {
      this.currentLineIndex = activeIndex;
      this.scrollToActiveLine();
    }
  }

  // 3. 控制屏幕滚动的方法
  private scrollToActiveLine(): void {
    // 找到 HTML 里 id 为 lyric-line-X 的元素
    const element = document.getElementById(`lyric-line-${this.currentLineIndex}`);
    if (element) {
      // 平滑滚动到中间
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

// ----------------------
    }
    public async ngOnInit(): Promise<void> {
        public ngOnInit(): void {
    // ... 这里应该有你原有的代码 ...

    // 1. 【修改】找到监听歌词的地方
    // 原代码里应该有一句类似 this.lyricsService.lyrics$.subscribe(...)
    this.subscription.add(this.lyricsService.lyrics$.subscribe(lyrics => {
        this._lyrics = lyrics;
        
        // +++ 请在这里插入这一行 +++
        // 当歌词数据变化时，立即解析它
        this.parseLrc(lyrics?.text); 
    }));

    // 2. 【新增】监听播放进度
    // 在 ngOnInit 的末尾添加这段代码：
    this.subscription.add(
      this.playbackInformationService.playbackInformation$.subscribe(info => {
        // 每次时间跳动 (0.x秒一次)，都去同步一下歌词
        if (info && info.currentTime !== undefined) {
          this.syncLyrics(info.currentTime);
        }
      })
    );
  }
        this.initializeSubscriptions();
        const currentPlaybackInformation: PlaybackInformation = await this.playbackInformationService.getCurrentPlaybackInformationAsync();
        await this.showLyricsAsync(currentPlaybackInformation.track);
    }

    private initializeSubscriptions(): void {
        this.subscription.add(
            this.playbackInformationService.playingNextTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            }),
        );

        this.subscription.add(
            this.playbackInformationService.playingPreviousTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            }),
        );

        this.subscription.add(
            this.playbackInformationService.playingNoTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            }),
        );
    }

    private destroySubscriptions(): void {
        this.subscription.unsubscribe();
    }

    private async showLyricsAsync(track: TrackModel | undefined): Promise<void> {
        if (track == undefined) {
            this._lyrics = undefined;
            return;
        }

        if (this.previousTrackPath === track.path && this._lyrics != undefined) {
            return;
        }

        this._isBusy = true;
        this._lyrics = await this.lyricsService.getLyricsAsync(track);
        this._isBusy = false;

        this.previousTrackPath = track.path;
    }
}
