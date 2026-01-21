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

// [新增] 1. 定义歌词行接口
interface LyricLine {
    time: number;
    text: string;
}

@Component({
    selector: 'app-now-playing-lyrics',
    host: { style: 'display: block; width: 100%; height: 100%;' },
    templateUrl: './now-playing-lyrics.component.html',
    styleUrls: ['./now-playing-lyrics.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class NowPlayingLyricsComponent implements OnInit, OnDestroy {
    private subscription: Subscription = new Subscription();
    public _lyrics: LyricsModel | undefined;
    private previousTrackPath: string = '';
    private _isBusy: boolean = false;

    // [新增] 2. 添加滚动歌词所需的变量
    public parsedLyrics: LyricLine[] = [];
    public currentLineIndex: number = -1;

    public lyricsSourceTypeEnum: typeof LyricsSourceType = LyricsSourceType;

    public largeFontSize: number = this.appearanceService.selectedFontSize * 1.7;
    public smallFontSize: number = this.appearanceService.selectedFontSize;

    public get isBusy(): boolean {
        return this._isBusy;
    }

    public constructor(
        private appearanceService: AppearanceServiceBase,
        private playbackInformationService: PlaybackInformationService,
        private lyricsService: LyricsServiceBase,
        public settings: SettingsBase
    ) {}

    public async ngOnInit(): Promise<void> {
        this.initializeSubscriptions();
        
        // 初始化时获取一次当前的播放信息
        const currentPlaybackInformation: PlaybackInformation = await this.playbackInformationService.getCurrentPlaybackInformationAsync();
        if (currentPlaybackInformation && currentPlaybackInformation.track) {
            await this.showLyricsAsync(currentPlaybackInformation.track);
        }
    }

    public ngOnDestroy(): void {
        this.destroySubscriptions();
    }

    private initializeSubscriptions(): void {
        // 监听下一首
        this.subscription.add(
            this.playbackInformationService.playingNextTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            })
        );

        // 监听上一首
        this.subscription.add(
            this.playbackInformationService.playingPreviousTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            })
        );

        // 监听无音乐
        this.subscription.add(
            this.playbackInformationService.playingNoTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            })
        );

        // [新增] 3. 监听播放时间更新，用于同步歌词滚动
        // 注意：这里假设 playbackInformation$ 包含 currentTime 更新。
        // 如果这里不触发，可能需要检查 PlaybackInformationService 里是否有专门的 timeUpdate 流
        this.subscription.add(
            this.playbackInformationService.playbackInformation$.subscribe((info) => {
                if (info && info.currentTime !== undefined) {
                    this.syncLyrics(info.currentTime);
                }
            })
        );
    }

    private destroySubscriptions(): void {
        this.subscription.unsubscribe();
    }

    private async showLyricsAsync(track: TrackModel | undefined): Promise<void> {
        if (track === undefined) {
            this._lyrics = undefined;
            this.parsedLyrics = []; // 清空滚动歌词
            return;
        }

        if (this.previousTrackPath === track.path && this._lyrics !== undefined) {
            return;
        }

        this._isBusy = true;
        this._lyrics = await this.lyricsService.getLyricsAsync(track);
        this._isBusy = false;

        this.previousTrackPath = track.path;

        // [新增] 4. 获取到新歌词后，立即解析
        if (this._lyrics && this._lyrics.text) {
            this.parseLrc(this._lyrics.text);
        } else {
            this.parsedLyrics = [];
        }
    }

    // ---------------------------------------------------------
    // [新增] 5. 核心辅助方法：解析与同步
    // ---------------------------------------------------------

    private parseLrc(lrcText: string): void {
        this.parsedLyrics = [];
        this.currentLineIndex = -1;

        if (!lrcText) return;

        // 正则匹配 [00:00.00] 或 [00:00.000]
        const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
        const lines = lrcText.split('\n');

        for (const line of lines) {
            const match = line.trim().match(regex);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = parseInt(match[3], 10);
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4].trim();

                // 只有文本存在时才添加
                if (text) {
                    this.parsedLyrics.push({ time, text });
                }
            }
        }
    }

    private syncLyrics(currentTime: number): void {
        if (this.parsedLyrics.length === 0) return;

        // 找到第一个时间大于当前时间的行
        const nextIndex = this.parsedLyrics.findIndex(line => line.time > currentTime);

        // 当前行应该是 nextIndex 的前一行
        let activeIndex = (nextIndex === -1) ? this.parsedLyrics.length - 1 : nextIndex - 1;

        if (activeIndex < 0) activeIndex = 0;

        if (activeIndex !== this.currentLineIndex) {
            this.currentLineIndex = activeIndex;
            this.scrollToActiveLine();
        }
    }

    private scrollToActiveLine(): void {
        // 这里的 ID 要对应 HTML 里的 id="lyric-line-{{i}}"
        const element = document.getElementById(`lyric-line-${this.currentLineIndex}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}