%% Example script for star-calibration
% This script illustrates how to run a geometric camera calibration with
% the STARCAL function in AIDA_tools.

%% 1, set-up of AIDA_tools
% First step is to add AIDA_tool to the matlab search-path, i.e. add all
% the AIDA_tools sub-directories to the list of directories matlab searches
% for functions. This is done by changing the current/working directory of
% matlab to the AIDA_tools directory. For the case where AIDA_tools is
% installed in the home-directory on a Linux/Unix system these are the
% steps:
cd ~
cd AIDA_tools/
AIDA_startup

%% Get to the image data
% This is one way to get the data.
% 
% Image data in png-files from directory contents:
dSkibotn = dir('/mnt/data/juha/falcon9/ams009/*.png');

%% Pre-processing options
% AIDA_tools have an image-reading function that can do a lot of
% pre-processing steps (filtering, corrections and the like). The
% processing steps are controlled with a struct with fields for steps to
% take and settings. The default steps are obtained with the
% TYPICAL_PRE_PROC_OPS function, it have a couple of default settings for
% different camera-systems and image formats. Here we dissable all tailored
% settings and turn off all image filterings

PO_Skibotn = typical_pre_proc_ops('none');

%% Look at an arbitrary image

iFile = 1%min(12,numel(dSkibotn));
[dSki,~,oSki] = inimg(fullfile(dSkibotn(1).folder,dSkibotn(1).name),PO_Skibotn);

colormap(bone)
imagesc(dSki)
colorbar
%% 
% Here we set the default colormap to BONE. This slightly blue-ish
% grayscale makes the image look "reasonably night-sky-ish" which aids the
% eye to recognize stars.
%% Adjusting the color-limits
% Typically images have intensity out-liers. Those might hide most of the
% interesting image contents. Therefore one might clip the intensity-limits
% using histogram-determined limits:
%cx = imgs_smart_caxis(0.2,dSki(:));
%disp(cx)
%% Manual adjusting the color-limits
caxis([0 0.5])
%% Enhancing stars
% For images 



%% Meta-data
% To use the stars in the sky for geometric calibration it is necessary to
% know where and when the image are taken. If there is no way for the
% image-reading functions to extract that meta-data STARCAL will query the
% user about location and time of observation, this is a bit of a drag. For
% ease of use, the camera-systems that put that meta-data into some type of
% gettable form it is adviced to make this an automatic part of
% image-reading. This is currently done for, at least, the ALIS, MIRACLE
% and HAARPOON systems. For images without such infomation it is possible
% to make a function that automatically does this. Like this:

long_lat = [12.63085,52.49509];
t_obs    = [2025,02,19,03,45,00.0];
PO_Skibotn.try_to_be_smart_fnc = @(filename) anything2obs(filename,...
                                                          0,...
                                                          'xyz',[0,0,0],...
                                                          'longlat',long_lat,...
                                                          'station',10,...
                                                          'time',t_obs,...
                                                          'filter',nan,...
                                                          'dt',0);
%%
% [dSki,~,oSki] = inimg(fullfile(dSkibotn(i1).folder,dSkibotn(i1).name),PO_Skibotn); 
SkMp = starcal(fullfile(dSkibotn(1).folder,dSkibotn(1).name),PO_Skibotn);
%SkMp.img = Dw;


