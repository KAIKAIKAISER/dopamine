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

    // 滚动歌词变量
    public parsedLyrics: LyricLine[] = [];
    public currentLineIndex: number = -1;
    
    // [新增] 定时器变量，用于替代找不到的 Observable
    private syncInterval: any = null;

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

    public ngOnInit(): void {
        this.initializeSubscriptions();
        PromiseUtils.noAwait(this.loadInitialLyrics());
        
        // [重点修改] 启动定时同步
        this.startLyricsSync();
    }

    private async loadInitialLyrics(): Promise<void> {
        const currentPlaybackInformation: PlaybackInformation = await this.playbackInformationService.getCurrentPlaybackInformationAsync();
        if (currentPlaybackInformation && currentPlaybackInformation.track) {
            await this.showLyricsAsync(currentPlaybackInformation.track);
        }
    }

    public ngOnDestroy(): void {
        this.destroySubscriptions();
        // [重点修改] 销毁定时器
        this.stopLyricsSync();
    }

    // [新增] 启动定时器：每 250ms (一秒4次) 主动去问一下当前时间
    private startLyricsSync(): void {
        this.stopLyricsSync(); // 防止重复启动
        this.syncInterval = setInterval(async () => {
            // 这里调用的是已知的、肯定存在的异步方法
            const info = await this.playbackInformationService.getCurrentPlaybackInformationAsync();
            if (info && info.currentTime !== undefined) {
                this.syncLyrics(info.currentTime);
            }
        }, 250); 
    }

    // [新增] 停止定时器
    private stopLyricsSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    private initializeSubscriptions(): void {
        this.subscription.add(
            this.playbackInformationService.playingNextTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            })
        );

        this.subscription.add(
            this.playbackInformationService.playingPreviousTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            })
        );

        this.subscription.add(
            this.playbackInformationService.playingNoTrack$.subscribe((playbackInformation: PlaybackInformation) => {
                PromiseUtils.noAwait(this.showLyricsAsync(playbackInformation.track));
            })
        );

        // [删除] 既然找不到那个流，我们就不订阅了，改用上面的 setInterval 方案
    }

    private destroySubscriptions(): void {
        this.subscription.unsubscribe();
    }

    private async showLyricsAsync(track: TrackModel | undefined): Promise<void> {
        if (track === undefined) {
            this._lyrics = undefined;
            this.parsedLyrics = [];
            return;
        }

        if (this.previousTrackPath === track.path && this._lyrics !== undefined) {
            return;
        }

        this._isBusy = true;
        this._lyrics = await this.lyricsService.getLyricsAsync(track);
        this._isBusy = false;

        this.previousTrackPath = track.path;

        if (this._lyrics && this._lyrics.text) {
            this.parseLrc(this._lyrics.text);
        } else {
            this.parsedLyrics = [];
        }
    }

    private parseLrc(lrcText: string): void {
        this.parsedLyrics = [];
        this.currentLineIndex = -1;

        if (!lrcText) return;

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

                if (text) {
                    this.parsedLyrics.push({ time, text });
                }
            }
        }
    }

    private syncLyrics(currentTime: number): void {
        if (this.parsedLyrics.length === 0) return;

        const nextIndex = this.parsedLyrics.findIndex(line => line.time > currentTime);
        let activeIndex = (nextIndex === -1) ? this.parsedLyrics.length - 1 : nextIndex - 1;

        if (activeIndex < 0) activeIndex = 0;

        if (activeIndex !== this.currentLineIndex) {
            this.currentLineIndex = activeIndex;
            this.scrollToActiveLine();
        }
    }

    private scrollToActiveLine(): void {
        const element = document.getElementById(`lyric-line-${this.currentLineIndex}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}