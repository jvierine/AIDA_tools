function mplayer(fName,varargin)
% Read and Play a Video File with (synchronized) Audio. Optionally provide
% handles to functions for framewise video processing, and for global audio
% processing.
%
% SYNTAX (Parameter-Values are described alphabetically):
%
% AVPlay
%   Launches a reader/player, using the default 'xylophone.mpg' file.
%  (You can select and load another file from the file menu.)
%
% AVPlay(fName)
%   Launches a new reader/player to read/play file fName.
%
% AVPlay(..., 'audioProcessFcn', fcn)
%   Where fcn is the handle to a function that is to be applied at readtime
%   to the entire audioStream (as opposed to framewise).
%      For example, fcn = @(A) highpass(A,3000,samplingFrequency);
%
% AVPlay(...,'currentFrameIndex', [1, numberOfFramesInFile])
%   Optionally specify a non-default index for starting playback. (Default:
%   1).
%
% AVPlay(...,'measureFrameRate', TF)
%   'measureFrameRate' (= true/false; Default: false) indicates whether the
%   actual frame rate should be measured and reported (in the title string).
%
% AVPlay(..., 'normalMode', TF)
%   'normalMode' (= true/false; Default: true) ind icates whether figure
%   should be created in "normal" (undocked) mode, despite
%   DefaultFigureWindowStyle setting.
%
% AVPlay(..., 'numberOfFramesToPlay',numberOfFramesToPlay)
%   'numberOfFramesToPlay' allows the specification of the maximum number
%   of frames to play, regardless of the size of the input video. (This
%   could be helpful for debugging, timing, etc.)
%
% AVPlay(..., 'showSoundAndProgress',TF)
%   'showSoundAndProgress' (= true/false; Default: true) indicates whether
%   the audio should be shown in a plot during playback. This may be useful
%   for visualization purposes, but the axes also will contain a draggable
%   marker indicating the progress of playback.
%
% AVPlay(..., 'showTitleAndTime',TF)
%   'showTitleAndTime' (= true/false; Default: true) indicates whether
%   the title of the video and the current time should be displayed
%   during playback.
%
% AVPlay(..., 'singleton', TF)
%   'singleton' (= true/false; Default: true) indicates whether existing
%   AVPlay instances should be automatically closed first.
%
% AVPlay(..., 'throttleToVideoFrameRate', TF)
%   'throttleToVideoFrameRate' (= true/false; Default: true) specifies
%   whether video playback should be throttled to play at "normal" playback
%   rate, or should be allowed to process as quickly as possible.
%
% AVPlay(..., 'timeStamps',timeStamps)
%   'timeStamps' is a vector of the timeStamps extracted from the video
%   file, or the name of a .mat file containing the stream. If you know it
%   a priori, great! Otherwise, AVPlay will figure it out for you. (But it
%   may take a moment.)
%
% AVPlay(..., 'videoProcessFcn', fcn)
%   Where fcn is a function handle to be applied framewise.
%     For example, fcn = @(I) rgb2gray(I);
%
% ADDITIONAL OPTIONAL SPECIFICATION PARAMETERS:
%   'playerColor'        (As a valid color string or rgb triplet.)
%   'requestedPosition'  (In normalized units: [left bott)om width
%         height].)
%   'titleColor'         (As a valid color string or rgb triplet.)
%
% [vidReader,audioInformation] = AVPlay(...)
%   Optionally returns handles to the internal videoReader, and to the
%   struct returned by audioinfo(fName).
%
% NOTES:
% * If the input file contains no audio, it will play in video mode
%   only.
% * Requires only core MATLAB.
%
% % EXAMPLES:
% % (NOTE: xylophone.mpg and xylophone.mp4 ship with MATLAB;
%          BigBuckBunny videos are shared video standards that can be
%          downloaded from here:
%             https://peach.blender.org/download/ )
%
% AVPlay('xylophone.mpg')
%
% % (If timestamp vector was previously saved in 'xylophoneTimestamps.mat'):
% AVPlay('xylophone.mpg', 'timeStamps', 'xylophoneTimestamps.mat')
%
% videoFcn = @(I) rgb2gray(I);
% audioFcn = @(A) lowpass(A,0.05);
% AVPlay('xylophone.mpg',...
%   'videoProcessFcn', videoFcn,...
%   'audioProcessFcn', audioFcn);
%
% %(FrameSize: 240x416x3)
% AVPlay('BigBuckBunny_512kb.mp4',...
%   'playerColor', [0 0 0.5]);
%
% AVPlay('BigBuckBunny.avi');
%
% %(FrameSize: 720x1280x3)
% AVPlay('BigBuckBunny.avi',...
%   'videoProcessFcn', @(I)rgb2gray(I));
%
% NOTES:
%
% Synchronization is enforced by playing time-stamped frames one at a time.
% If the processing is expensive, the audio or video may become choppy--but
% will stay in synch.
%
% This environment may be useful (with modest modifications) for
% synchronous analysis or visualization of other types of signals.
%
% Brett Shoelson, PhD
% brett.shoelson@mathworks.com
% 9/14/2016; 1/30/2018; 10/10/2018
%
% See also: VideoReader, audioread, audioinfo

% Copyright 2016-2019 The MathWorks, Inc.

%Initialize/Parse Inputs; put everything in a single struct:
AVP = parseInputs(varargin{:});
%
if nargin < 1
    % No input file specified--use sample
    AVP.fName = 'xylophone.mpg' %#ok<NOPRT>
else
    AVP.fName = fName;
end
[~,baseName,ext] = fileparts(AVP.fName);
AVP.baseName = [baseName,ext];

% AVPLAYER ENVIRONMENT
setupAVPlayerEnvironment;

% VIDEOREADER OBJECT:
setupVideoReader;

% UIMENUS:
setupUIMenus;

% TOOL PANEL:
setupToolPanel;

% SETUP FOR AUDIO:
setupAudio;

% SET UP DISPLAYS:
setupDisplays;

AVP.parentFigure.CloseRequestFcn = ...
    @(~,~)closeFigure(AVP.videoObject);
AVP.parentFigure.Visible = 'on';

% NESTED SUBFUNCTIONS:
    function adjustBrightness(~,~,val,varargin)
        tmp = AVP.videoFrame;
        if val == 100
            AVP.brightenValue = 0;
            updateVideoDisplay
            return
        end
        AVP.brightenValue = AVP.brightenValue + val;
        AVP.brightenValue = max(AVP.brightenValue,-1);
        AVP.brightenValue = min(AVP.brightenValue,1);
        try
            [tmp,cmap] = rgb2ind(tmp,255);
            AVP.videoFrame = ind2rgb(tmp,brighten(cmap,AVP.brightenValue));
            updateVideoDisplay;
        catch
            disp('Unable to adjust brightness.')
        end
        %imgObject.CData = ind2rgb(tmp,brighten(cmap,val));
    end %adjustBrightness

    function changeBGColor(varargin)
        newColor = uisetcolor;
        if numel(newColor) == 3
            % Success
            AVP.parentFigure.Color = newColor;
            titleColor = AVP.titleHandle.Color;
            if AVP.showTitleAndTime && abs(mean(titleColor)-mean(newColor))<0.1
                changeTitleColor;
            end
        end
    end %changeBGColor

    function changeTitleColor(varargin)
        newColor = uisetcolor('Select new title color');
        if numel(newColor) == 3
            % Success
            AVP.titleHandle.Color = newColor;
        end
    end %changeTitleColor

    function closeFigure(vidReader) %#ok<INUSD>
        %closeRequested = true;
        AVP.isPaused = true;
        pause(0.1);
        closereq;
    end %closeFigure

    function determineNumberOfFrames(varargin)
        % NEED TO KNOW THE NUMBER OF FRAMES...
        disp('Determining timeStamps and number of frames....');
        try
            ii = 1;
            timeStamp = nan(ceil(AVP.videoObject.Duration*AVP.videoObject.FrameRate)+100,1);
            while hasFrame(AVP.videoObject)
                timeStamp(ii) = AVP.videoObject.CurrentTime;
                readFrame(AVP.videoObject);
                ii = ii + 1;
            end
            timeStamp = timeStamp(~isnan(timeStamp));
            AVP.timeStamps = timeStamp;
            AVP.numberOfFramesInFile = length(AVP.timeStamps);
            %RESET:
            AVP.videoObject = VideoReader(AVP.fName);
        catch
            error('Sorry...unable to read this file!')
        end
        set(AVP.parentFigure,'pointer','arrow')
        
    end %determineNumberOfFrames

    function jumpTo(~,~,request,requestedValue)
        % POSSIBLE OPTIONS FOR 'REQUEST':
        % {'frameNumber', 'frameOffset'}
        %disp('hereiam')
        switch request
            case 'frameNumber'
                frameNumber = round(min(AVP.numberOfFramesInFile,...
                    max(1,requestedValue)));
            case 'frameOffset'
                if requestedValue == -5.5 %Code for back 5 seconds
                    requestedValue = - round(5 * AVP.frameRate);
                elseif requestedValue == 5.5 %Code for forward 5 seconds
                    requestedValue =   round(5 * AVP.frameRate);
                end
                frameNumber = round(min(AVP.numberOfFramesInFile,...
                    max(1,AVP.currentFrameIndex + requestedValue)));
            otherwise
                error('AVPlay/jumpTo: Unrecognized ''method'' string.')
        end
        AVP.currentFrameIndex = frameNumber;
        updateAudioAndVideo(AVP.currentFrameIndex, true) % Suppress audio
    end % jumpTo

    function openFileName(varargin)
        formats = VideoReader.getFileFormats();
        filterspec = getFilterSpec(formats);
        filterspec = filterspec{1};
        [fName,pathName] = uigetfile(filterspec);
        if isempty(fName) || (~ischar(fName) && fName==0)
            return
        end
        fName = fullfile(pathName,fName);
        AVPlay(fName)
    end %openfileName

    function playAudioFrame(varargin)
        if AVP.hasAudio
            sound(AVP.audioFrame, AVP.audioInformation.SampleRate);
            
            % Hear the entire audio stream:
            % sound(AVP.audioStream, AVP.audioInformation.SampleRate);
            
            % Compare sound() vs play(audioplayer):
            % for jj = 1:AVP.numberOfFramesInFile
            %    jj
            %    audioRange = AVP.audioSamplesPerFrame * ...
            %       [jj - 1, jj] + [1, 0];
            %    audioRange = min(audioRange,size(AVP.audioStream,1));
            %    play(AVP.audioplayerObject,audioRange);
            %    % sound(AVP.audioStream(audioRange(1):audioRange(2),:),...
            %    %    AVP.audioInformation.SampleRate)
            % end
            
        end
    end %playAudioFrame

    function playPauseVideo(varargin)
        AVP.isPaused = ~AVP.isPaused;
        if AVP.isPaused
            AVP.videoButtons(4).CData = AVP.icons{4};
        else
            AVP.videoButtons(4).CData = AVP.icons{9};
        end
        % % READ/PLAY
        % % Use a for loop to read and play the (audio/)video frames.
        %for ii = AVP.currentFrameIndex:AVP.numberOfFramesToPlay
        while AVP.currentFrameIndex <= AVP.numberOfFramesToPlay
            if AVP.isPaused
                return
            end
            tStart = tic;
            %
            updateAudioAndVideo(AVP.currentFrameIndex);
            %
            tStop = toc(tStart);
            if AVP.throttleToVideoFrameRate
                pause(AVP.secondsPerFrame - tStop);
            else
                drawnow('limitrate','nocallbacks');
            end
            AVP.currentFrameIndex = AVP.currentFrameIndex + 1;
            if AVP.loopPlay && AVP.currentFrameIndex == AVP.numberOfFramesInFile
                AVP.currentFrameIndex = 1;
            end
        end %while AVP.currentFrameIndex < AVP.numberOfFramesToPlay
        %
        AVP.currentFrameIndex = 1;
        AVP.isPaused = true;
        AVP.videoButtons(4).CData = AVP.icons{4};
        
    end %playPauseVideo

    function reportVideoInfo(varargin)
        fprintf('\n*****VIDEO*****\n')
        disp(AVP.videoObject)
        if ~isempty(AVP.videoProcessFcn)
            fprintf('\nVideo process function: %s\n',func2str(AVP.videoProcessFcn));
        end
        fprintf('\n*****AUDIO*****\n')
        disp(AVP.audioInformation)
        if ~isempty(AVP.audioProcessFcn)
            fprintf('\nAudio process function: %s\n',func2str(AVP.audioProcessFcn));
        end
        fprintf('\n***************\n')
    end %reportProperties

    function requestAudioFrame(index)
        % for ii = 1:AVP.numberOfFramesToPlay
        %    tStart = tic;
        %    sound(AVP.audioStream((ii-1)*AVP.audioSamplesPerFrame + 1 :...
        %              ii * AVP.audioSamplesPerFrame),...
        %              AVP.audioInformation.SampleRate,8)
        %    tStop = toc(tStart);
        %    pause(AVP.secondsPerFrame - tStop)
        % end
        AVP.audioFrame = AVP.audioStream( (index - 1) * AVP.audioSamplesPerFrame + 1 : ...
            index * AVP.audioSamplesPerFrame );
    end %requestAudioFrame

    function requestCustomVideoFunction(varargin)
        wasEmpty = true;
        tmpStr = '';
        if ~isempty(AVP.videoProcessFcn)
            wasEmpty = false;
            tmp = questdlg('Do you want to overwrite the existing video processing  function?',...
                'Process Function Exists!','NO','Yes','NO');
            if ~strcmp(tmp,'Yes')
                return
            end
            tmpStr = func2str(AVP.videoProcessFcn);
        end
        tmp = inputdlg(sprintf('Enter a function handle:\n(E.g., @(I) rgb2gray(I))\n'),...
            'Function Handle',[1 70],{tmpStr});
        if isempty(tmp{1})
            if ~wasEmpty
                tmp2 = questdlg('Clear existing process function?','Clear?','YES','No','YES');
                if strcmp(tmp2,'YES')
                    AVP.videoProcessFcn = [];
                    return
                end
            end
        else
            try
                AVP.videoProcessFcn = str2func(tmp{1});
            catch
                beep
                disp('That didn''t work! Try again...');
                requestCustomVideoFunction
            end
        end
    end %requestCustomVideoFunction

    function requestCustomAudioFunction(varargin)
        wasEmpty = true;
        tmpStr = '';
        if ~isempty(AVP.audioProcessFcn)
            wasEmpty = false;
            tmp = questdlg('Do you want to overwrite the existing audio processing  function?',...
                'Process Function Exists!','NO','Yes','NO');
            if ~strcmp(tmp,'Yes')
                return
            end
            tmpStr = func2str(AVP.audioProcessFcn);
        end
        tmp = inputdlg(sprintf('Enter a function handle:\n(E.g., @(A) lowpass(A,0.1)\n'),...
            'Function Handle',[1 70],{tmpStr});
        if isempty(tmp{1})
            if ~wasEmpty
                tmp2 = questdlg('Clear existing process function?','Clear?','YES','No','YES');
                if strcmp(tmp2,'YES')
                    AVP.audioProcessFcn = [];
                    return
                end
            end
        else
            try
                AVP.audioProcessFcn = str2func(tmp{1});
            catch
                beep
                disp('That didn''t work! Try again...');
                requestCustomAudioFunction
            end
        end
    end %requestCustomAudioFunction

    function requestVideoFrame(type,index)
        % 'TYPE': may be either {'index' or 'timeStamp'}
        %Reads, updates videoFrame field of AVP
        if nargin < 1
            type = 'index';
        end
        if nargin < 2
            index = 1;
        end
        AVP.frameStartTime = AVP.timeStamps(index);
        switch type
            case 'index'
                AVP.videoFrame = read(AVP.videoObject, index);
            case 'timeStamp'
                % Note: Setting the CurrentTime of the video object adds
                % significant overhead:
                % AVP.videoObject.CurrentTime = AVP.frameStartTime;
                %
                % By default, I will use 'index' referencing; I include
                % timeStamp referencing to facilitate the synchronization
                % and fusion of external signals. This approach adds almost
                % imperceptible overhead:
                [~,index] = min(abs(AVP.timeStamps - AVP.frameStartTime));
                AVP.videoFrame = read(AVP.videoObject, index);
        end
        AVP.frameEndTime = AVP.videoObject.CurrentTime;
    end %requestVideoFrame

    function saveTimeStamps(~,~,prompt)
        pn = fileparts(which(mfilename));
        pn = fullfile(pn,'TimestampFiles');
        if ~exist(pn,'dir')
            mkdir(pn)
        end
        [~,fn] = fileparts(AVP.fName);
        %selpath = uigetdir(pn,'Save to...')
        timeStamps = AVP.timeStamps; 
        if prompt
            uisave('timeStamps', fullfile(pn,[fn, 'TimeStamps.mat']))
        else
            if ~exist(fullfile(pn,[fn, 'TimeStamps.mat']),'file')
                save(fullfile(pn,[fn, 'TimeStamps.mat']),'timeStamps');
            end
        end
    end %saveTimeStamps

    function setupAudio(varargin)
        AVP.hasAudio = false;
        try
            %If this is successful, the file has a readable audio stream
            AVP.audioInformation = audioinfo(AVP.fName);
            if AVP.audioInformation.TotalSamples == 0
                disp('There does not appear to be a readable audio stream in this file.');
                disp('(Playing video stream only.)');
            else
                AVP.hasAudio = true;
            end
            AVP.audioSamplesPerFrame = floor(AVP.audioInformation.TotalSamples/...
                AVP.numberOfFramesInFile);
        catch
            %(hasAudio = false)
            disp('There was an error extracting the audio stream!');
            disp('(Playing video stream only.)');
        end
        %
        if AVP.hasAudio
            % This could be limiting; we pre-read (and then optionally
            % process) the entire audio stream!
            %if isempty(AVP.timeStamps)
            disp('Reading audio stream....');
            %tic;
            AVP.audioStream = audioread(AVP.fName);
            %tAudioRead = toc;
            %end
            % AVP.audioplayerObject = audioplayer(AVP.audioStream,...
            %    AVP.audioInformation.SampleRate);
            AVP.maxAudioAmplitude = max(max(abs(AVP.audioStream)));
            if ~isempty(AVP.audioProcessFcn)
                AVP.audioStream = AVP.audioProcessFcn(AVP.audioStream);
            end
            %fprintf('(Reading audio stream completed in %0.1f seconds.)\n',tAudioRead);
        else
            % This is just for plotting, bookkeeping:
            AVP.maxAudioAmplitude = 1;
            AVP.audioSamplesPerFrame = AVP.numberOfFramesInFile;
        end %if hasAudio
    end %setupAudio

    function setupAVPlayerEnvironment(varargin)
        % Set up environment
        if AVP.singleton
            delete(findobj('tag','myAVPlayer'));
        end
        
        % ENVIRONMENT SETUP
        AVP.parentFigure = figure('numbertitle','off',...
            'name','AVPlayer',...
            'units','normalized',...
            'visible','off',...
            'tag','myAVPlayer',...
            'menubar','none',...
            'colormap',gray,...
            'color',AVP.playerColor);
        if AVP.normalMode
            % Ignore default windowstyle (e.g., 'docked')
            AVP.parentFigure.WindowStyle = 'Normal';
        end
        AVP.parentFigure.Position = AVP.requestedPosition;
        AVP.parentFigure.BusyAction = 'cancel';
    end %setupAVPlayerEnvironment

    function setupDisplays(varargin)
        if AVP.showSoundAndProgress
            % Note: we create this even if hasAudio is false because it shows
            %       progress through video.
            panelHeight = 0.075;
            AVP.timelinePanel = uipanel('parent',AVP.parentFigure,...
                'units','normalized',...
                'position',[0 panelHeight 1 panelHeight]);
            AVP.soundAndTimelineAx = axes('parent',AVP.timelinePanel,...
                'units','normalized',...
                'pos',[0 0 1 1],...
                'color','w',...
                'tag','soundAndTimelineAx');
            AVP.soundPlot = plot(AVP.soundAndTimelineAx,...
                zeros(AVP.audioSamplesPerFrame,1));
            set(AVP.soundAndTimelineAx,...
                'XLim',[1 , AVP.audioSamplesPerFrame],...
                'YLim',[-AVP.maxAudioAmplitude , AVP.maxAudioAmplitude],...
                'YLimMode','Manual',...
                'YTick',-0.75:0.25:0.75,...
                'FontSize',6,...
                'XColor','w',...
                'YColor','w');
            colormap(AVP.soundAndTimelineAx,jet);
            pos = [0.05 0.175 0.9 0.775];
        else
            pos = [0.05 0.05 0.9 0.9];
        end
        % Set up sound-plot axis
        if AVP.showSoundAndProgress
            AVP.progressMarker = line(AVP.soundAndTimelineAx,...
                [AVP.timeStamps(1) AVP.timeStamps(1)],0.75*[-AVP.maxAudioAmplitude-1 , AVP.maxAudioAmplitude],...
                'color','r',...
                'linewidth',1,...%'AlignVertexCenters','on',...
                'marker','v','markersize',10,'markerfacecolor','r');
            
            % DRAGGABLE:
            % This version triggers callback on endfcn only:
            % draggableBrief(AVP.progressMarker,@updateTimeline,'h')
            % This version triggers callback on movefcn (so allows scrubbing):
            draggable(AVP.progressMarker,@updateTimeline,'h')
        end
        
        % SET UP FOR FRAME DISPLAY:
        AVP.imgAx = axes('units','normalized',...
            'pos',pos);
        AVP.imgAx.BusyAction = 'cancel';
        
        % VIDEO SETUP:
        requestVideoFrame('index',1);
        if ~isempty(AVP.videoProcessFcn)
            AVP.videoFrame = AVP.videoProcessFcn(AVP.videoFrame);
        end
        AVP.frameHandle = imshow(AVP.videoFrame,...
            'parent',AVP.imgAx);
        if AVP.showTitleAndTime
            AVP.titleHandle = title(sprintf('%s: t = %0.3f',baseName,AVP.frameEndTime),...
                'Interpreter','none','color',AVP.titleColor);
        end
        
    end %setupDisplays

    function setupToolPanel(varargin)
        % Tool Panel:
        panelHeight = 0.075;
        AVP.toolsPanel = uipanel('parent',AVP.parentFigure,...
            'units','normalized',...
            'position',[0 0 1 panelHeight],...
            'visible','on');
        % Video Advancement Buttons
        % ICON SOURCE:
        % C:\Program Files\MATLAB\R2015b\toolbox\sl3d\sl3d\+vr\icons
        % (From: vrplay/icons = load('vrplay_icons')
        icons = load('videoPlayerIcons');
        icons = struct2cell(icons.icons);
        % 1) File Open
        % 2) Beginning
        % 3) Fast Reverse
        % 4) Back 1
        % 5) Stop
        % 6) Play
        % 7) Forward 1
        % 8) Fast Forward
        % 9) End of File
        % 10) Jump To
        % 11) Loop Off
        % 12) Play Off
        % 13) Pause
        % 14) Loop On
        useInds = [2:4,6:9,11,13,14];
        icons = icons(useInds);
        % Add faster/slower buttons
        toolIcon = icons{4};
        toolIcon(~isnan(toolIcon)) = 0;
        toolIcon = imrotate(toolIcon,90);
        toolIcon2 = imrotate(toolIcon,180);
        toolIcon3 = imread('Help_16.png');
        icons = [icons;{toolIcon;toolIcon2;toolIcon3}];
        % NOW SHOULD BE:
        % 1) Beginning
        % 2) Fast Reverse
        % 3) Back 1
        % 4) Play
        % 5) Forward 1
        % 6) Fast Forward
        % 7) End of File
        % 8) Loop Off
        % 9) Pause
        % 10) Loop On
        % 11) Faster
        % 12) Slower
        % 13) Information
        iconTooltips = {'Go to beginning',...
            'Back up 5 seconds',...
            'Back up 1 frame',...
            'Play/Pause Video',...
            'Forward 1 frame',...
            'Forward 5 seconds',...
            'Go to end',...
            'Loop on/off',...
            'Play/Pause Video',...
            'Loop on/off',...
            'Play Faster',...
            'Play Slower',...
            'Information'};
        videoButtonCallbacks = {...
            {@jumpTo,'frameNumber',1},...
            {@jumpTo,'frameOffset',-5.5},...%Code for -5sec
            {@jumpTo,'frameOffset',-1},...
            {@(obj,~)playPauseVideo(obj)},...%@playPauseVideo,AVP
            {@jumpTo,'frameOffset',1},...
            {@jumpTo,'frameOffset',+5.5},...%Code for +5sec
            {@jumpTo,'frameNumber',Inf},...
            @toggleLoopPlay,...
            @playPauseVideo,...%SKIP
            @toggleLoopPlay,...%SKIP
            @playFaster,...
            @playSlower,...
            @reportVideoInfo};
        %useInds = [1:8,11:13];
        useInds = [1:8,13];
        nButtons = numel(useInds);
        [objpos,objdim] = distributeObjects(nButtons,0,1,0);
        videoButtons = gobjects(nButtons,1);
        for ind = 1:nButtons
            videoButtons(ind) = uicontrol('parent',AVP.toolsPanel,...
                'units','normalized',...
                'position',[objpos(ind) 0 objdim 1],...
                'cdata',icons{useInds(ind)},...
                'userdata',useInds(ind),...
                'callback',videoButtonCallbacks{useInds(ind)},...
                'tooltip',iconTooltips{useInds(ind)});
        end %for ind = 1:nButtons
        AVP.icons = icons;
        AVP.videoButtons = videoButtons;
    end %setupToolPanel

    function setupUIMenus(varargin)
        % FILE Menu
        f = uimenu(AVP.parentFigure,'Label','File');
        uimenu(f,...
            'Label','New Video...',...
            'callback',@openFileName);
        f = uimenu(AVP.parentFigure,'Label','Environment Options');
        uimenu(f,...
            'Label','Change Figure Color...',...
            'callback',@changeBGColor);
        uimenu(f,...
            'Label','Change Title Color...',...
            'callback',@changeTitleColor);
        %
        % PREPROCESSING Menu
        f = uimenu(AVP.parentFigure,...
            'Label','Video-frame Processing');
        uimenu(f,...
            'Label','Brighten Frames',...
            'callback',{@adjustBrightness,0.1});
        uimenu(f,...
            'Label','Darken Frames',...
            'callback',{@adjustBrightness,-0.1});
        uimenu(f,...
            'Label','Reset Brightness',...
            'callback',{@adjustBrightness,100});
        uimenu(f,...
            'Label','Custom Function',...
            'callback',@requestCustomVideoFunction);
        
        % (NOTE: audio processing is currently done on the entire stream
        % after loading, so on-the-fly modification of the audioProcessFcn
        % would require re-loading and re-processing of the audio stream.)
        %
        % f = uimenu(AVP.parentFigure,...
        %    'Label','Audio Pre-Processing');
        % uimenu(f,...
        %    'Label','Custom Function',...
        %    'callback',@requestCustomAudioFunction);
        
        % SAVE Menu
        f = uimenu(AVP.parentFigure,...
            'Label','Save');
        uimenu(f,...
            'Label','Save Timestamps',...
            'callback',{@saveTimeStamps,true});
        
        % SHORTCUTS Menu
        f = uimenu(AVP.parentFigure,...
            'Label','Shortcuts');
        uimenu(f,...
            'Label','Forward 1 Frame (Keyboard: right arrow)',...
            'callback',{@jumpTo,'frameOffset',1},...
            'accelerator','f');
        uimenu(f,...
            'Label','Backward 1 Frame (Keyboard: left arrow)',...
            'callback',{@jumpTo,'frameOffset',-1},...
            'accelerator','b');
        uimenu(f,...
            'Label','Toggle Zoom',...
            'checked','off',...
            'tag','Toggle Zoom',...
            'accelerator','z',...
            'callback',@(varargin)zoom);
    end %setupUIMenus

    function setupVideoReader
        % Create videoReader object, determine number of frames:
        AVP.videoObject = VideoReader(AVP.fName);
        % This will facilitate later support of imageDatastore:
        AVP.frameRate = AVP.videoObject.FrameRate;
        AVP.frameSize = ...
            [AVP.videoObject.Width,AVP.videoObject.Height];
        if isempty(AVP.timeStamps)
            % First determine if timeStamp vector for this filename was
            % previously saved...
            %%%
            pn = fileparts(which(mfilename));
            pn = fullfile(pn,'TimestampFiles');
            if exist(pn,'dir')
                [~, baseName] = fileparts(AVP.baseName);
                fn = fullfile(pn,[baseName, 'TimeStamps.mat']);
                if exist(fn,'file')
                    loadFromFile = questdlg('It appears that you have a pre-saved timeStamp file associated with this video. Would you like to load it?',...
                        'Load Existing Timestamp File?',...
                        'YES','No','YES');
                    if strcmp(loadFromFile,'YES')
                        AVP.timeStamps = loadFromFilename(fn);
                        AVP.numberOfFramesInFile = length(AVP.timeStamps);
                    end
                end
            end
            %%%
            if isempty(AVP.timeStamps)
                determineNumberOfFrames; %Also determines AVP.timeStamps
                % Autosave timeStamp vector
                saveTimeStamps(1,1,false) %First two inputs are ignored here
            end
            if isempty(AVP.numberOfFramesToPlay) ||...
                    isinf(AVP.numberOfFramesToPlay)
                AVP.numberOfFramesToPlay = AVP.numberOfFramesInFile;
            end
        else
            if ischar(AVP.timeStamps)
                AVP.timeStamps = loadFromFilename(AVP.timeStamps);
            end
            AVP.numberOfFramesInFile = numel(AVP.timeStamps);
        end
        %
        if ~isinf(AVP.numberOfFramesToPlay)
            AVP.numberOfFramesToPlay = ...
                min(AVP.numberOfFramesInFile,AVP.numberOfFramesToPlay);
        else
            AVP.numberOfFramesToPlay = AVP.numberOfFramesInFile;
        end
        AVP.secondsPerFrame = AVP.videoObject.Duration/AVP.numberOfFramesInFile;
        if AVP.measureFrameRate
            AVP.frameRateDetector = MeasFps('AveragingCount', 10);
        end
        AVP.isPaused = true;
        AVP.loopPlay = false;
        AVP.brightenValue = 0;
        
        function ts = loadFromFilename(fn)
            ts = load(fn);
            if isa(ts,'struct')
                fn = fieldnames(ts);
                fn = fn{1};
                ts = eval(['ts.',fn]);
                ts = ts(:);
            end
        end %loadFromFilename
        
    end %setupVideoReader

    function toggleLoopPlay(varargin)
        AVP.loopPlay = ~AVP.loopPlay;
        if AVP.loopPlay
            AVP.videoButtons(8).CData = AVP.icons{10};
        else
            AVP.videoButtons(8).CData = AVP.icons{8};
        end
    end %toggleLoopPlay

    function updateAudioAndVideo(index, suppressAudio)
        if nargin < 2
            suppressAudio = false;
        end
        %
        requestVideoFrame('index',index)
        if ~isempty(AVP.videoProcessFcn)
            AVP.videoFrame =  AVP.videoProcessFcn(AVP.videoFrame);
        end
        if AVP.brightenValue ~= 0
            adjustBrightness(1,1,0)% 1,1 are junk inputs...
        end
        updateVideoDisplay
        if AVP.hasAudio
            requestAudioFrame(max(1,index));
            % Audio processing is done en masse after loading...
            % if ~isempty(AVP.audioProcessFcn)
            %    AVP.audioFrame = AVP.audioProcessFcn(AVP.audioFrame);
            % end
            if ~suppressAudio
                playAudioFrame;
            end
        end
        updateSoundAndProgress(index)
        drawnow; %Flush event queues
    end %updateAudioAndVideo

    function updateSoundAndProgress(index)
        % Amplify visual presentation of audio signal:
        if AVP.hasAudio
            AVP.soundPlot.XData = 1:numel(AVP.audioFrame(1,:));
            AVP.soundPlot.YData = AVP.audioFrame(1,:);
        end
        AVP.progressMarker.XData = [index index]  * AVP.audioSamplesPerFrame / AVP.numberOfFramesInFile;
    end %updateSoundAndProgress

    function updateTimeline(obj,varargin)
        index = round(obj.XData(1) * AVP.numberOfFramesInFile / AVP.audioSamplesPerFrame);
        jumpTo(0,0,'frameNumber',index)
    end %updateTimeline

    function updateVideoDisplay(varargin)
        % Displays current frame, updates title
        AVP.frameHandle.CData = AVP.videoFrame;
        %
        if AVP.measureFrameRate
            AVP.measuredFrameRate = step(AVP.frameRateDetector);
        end
        %
        
        if AVP.showTitleAndTime
            if AVP.measureFrameRate
                AVP.titleHandle.String = ...
                    sprintf('%s: t = %0.3f (Rate: %0.3f fps)',...
                    AVP.baseName, AVP.frameEndTime,...
                    AVP.measuredFrameRate);
            else
                AVP.titleHandle.String = ...
                    sprintf('%s: t = %0.3f', AVP.baseName, AVP.frameEndTime);
            end
        end
        drawnow('limitrate','nocallbacks');
    end %updateVideoDisplay

end %AVPlay

function AVP = parseInputs(varargin)
% Setup parser with defaults
% NOTE: For convenience, I keep everything alphabetically in one struct...
parser = inputParser;
parser.CaseSensitive = false;
parser.addParameter('audioProcessFcn',[]);
parser.addParameter('currentFrameIndex',1);
parser.addParameter('measureFrameRate',false);
parser.addParameter('normalMode', true);
parser.addParameter('numberOfFramesToPlay', Inf);
parser.addParameter('playerColor', 'k');
parser.addParameter('requestedPosition', [0.05 0.05 0.9 0.85]);
parser.addParameter('showSoundAndProgress',true);
parser.addParameter('showTitleAndTime',true);
parser.addParameter('singleton',true);
parser.addParameter('throttleToVideoFrameRate',true);
parser.addParameter('timeStamps', []);
parser.addParameter('titleColor','w');
parser.addParameter('videoProcessFcn',[]);
% Parse input
parser.parse(varargin{:});
% Assign outputs
r = parser.Results;
[   AVP.audioProcessFcn,...
    AVP.currentFrameIndex,...
    AVP.measureFrameRate,...
    AVP.normalMode,...
    AVP.numberOfFramesToPlay,...
    AVP.playerColor,...
    AVP.requestedPosition,...
    AVP.showSoundAndProgress,...
    AVP.showTitleAndTime,...
    AVP.singleton,...
    AVP.throttleToVideoFrameRate,...
    AVP.timeStamps,...
    AVP.titleColor,...
    AVP.videoProcessFcn] = ...
    ...
    deal(...
    r.audioProcessFcn,...
    r.currentFrameIndex,...
    r.measureFrameRate,...
    r.normalMode,...
    r.numberOfFramesToPlay,...
    r.playerColor,...
    r.requestedPosition,...
    r.showSoundAndProgress,...
    r.showTitleAndTime,...
    r.singleton,...
    r.throttleToVideoFrameRate,...
    r.timeStamps,...
    r.titleColor,...
    r.videoProcessFcn);
% Additional fields:
[   AVP.audioFrame,...
    AVP.audioInformation,...
    AVP.audioSamplesPerFrame,...
    AVP.audioStream,...
    AVP.baseName,...
    AVP.brightenValue,...
    AVP.fName,...
    AVP.frameEndTime,...
    AVP.frameHandle,...
    AVP.frameRate,...
    AVP.frameRateDetector,...
    AVP.frameSize,...
    AVP.frameStartTime,...
    AVP.hasAudio,...
    AVP.icons,...
    AVP.imgAx,...
    AVP.isPaused,...
    AVP.loopPlay,...
    AVP.maxAudioAmplitude,...
    AVP.measuredFrameRate,...
    AVP.numberOfFramesInFile,...
    AVP.parentFigure,...
    AVP.progressMarker,...
    AVP.secondsPerFrame,...
    AVP.soundAndTimelineAx,...
    AVP.soundPlot,...
    AVP.timelinePanel,...
    AVP.titleHandle,...
    AVP.toolsPanel,...
    AVP.videoButtons,...
    AVP.videoFrame,...
    AVP.videoObject] = deal([]);
% Alphabetize fields
% (The sort is necessary here to sort on LOWER of fieldnames; otherwise
% capitalization is an issue.)
[~,inds] = sort(lower(fieldnames(AVP)));
AVP = orderfields(AVP,inds);
end %parseInputs