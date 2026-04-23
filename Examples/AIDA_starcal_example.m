%% AIDA star-calibration example
% This script demonstrates a basic geometric camera calibration workflow
% with STARCAL in AIDA_tools. The example uses a sequence of PNG images,
% applies lightweight preprocessing, inspects the data, enhances stars by
% stacking multiple frames, supplies observation metadata, and finally
% launches STARCAL.

%% 1. Set up AIDA_tools
% Add the AIDA_tools directories to the MATLAB path by running
% AIDA_startup from the repository root. A typical Unix-like setup looks
% like this:
cd ~
cd AIDA_tools
AIDA_startup

%% 2. Point to an image sequence
% Replace this path with your own observation directory.
dSkibotn = dir('/bigdata/Campaigns/Meteors2020/Skibotn/20201213-021937/*.png');

% Stop early if the example path does not exist on the current machine.
assert(~isempty(dSkibotn), 'No PNG files found. Update dSkibotn to point to your image directory.')

%% 3. Choose preprocessing options
% inimg can apply several instrument-specific corrections. Here we start
% from the plain "none" preset so the example is easy to adapt to new
% data sets.
PO_Skibotn = typical_pre_proc_ops('none');

%% 4. Inspect one representative frame
% Pick one frame for a quick visual check before stacking images or
% starting the calibration.
iFile = min(12, numel(dSkibotn));
exampleFile = fullfile(dSkibotn(iFile).folder, dSkibotn(iFile).name);
[dSki,~,~] = inimg(exampleFile, PO_Skibotn);

figure
colormap(bone)
imagesc(dSki)
axis image
colorbar
title(sprintf('Example frame: %s', dSkibotn(iFile).name), 'interpreter', 'none')

% The BONE colormap often works well for night-sky imagery because it keeps
% the display close to grayscale while making stars a bit easier to spot.

%% 5. Adjust the displayed intensity range
% Bright outliers can hide faint stars. imgs_smart_caxis suggests a useful
% display range from the image histogram.
disp(imgs_smart_caxis(0.2, dSki(:)))

% You can still override the suggested limits manually if needed.
caxis([0 20])

%% 6. Enhance stars by stacking several frames
% Summing multiple nearby images increases the visibility of stars. The
% second stack (Dw) also applies a local background-removal + Wiener filter
% to suppress slow-varying background structure.
iStart = max(1, 9);
iStop = min(148, numel(dSkibotn));
[dSki,~,~] = inimg(exampleFile, PO_Skibotn);
D = zeros(size(dSki));
Dw = zeros(size(dSki));

for i1 = iStart:iStop
  stackFile = fullfile(dSkibotn(i1).folder, dSkibotn(i1).name);
  [dSki,~,~] = inimg(stackFile, PO_Skibotn);
  D = D + dSki;
  Dw = Dw + wiener2(dSki - medfilt2(dSki, [9 9], 'symmetric'), [5 5]);
end

disp('Done reading and stacking images.')

figure
colormap(bone)
subplot(2,2,1)
imagesc(dSki)
axis image
title('Last input frame')
colorbar

subplot(2,2,2)
imagesc(D)
axis image
imgs_smart_caxis(0.001, D(:));
title('Summed frames')
colorbar

subplot(2,2,3)
imagesc(Dw)
axis image
imgs_smart_caxis(0.001, Dw(:));
title('Filtered star-enhanced stack')
colorbar

%% 7. Supply observation metadata
% STARCAL needs the observation time and camera location. If that metadata
% cannot be extracted from the files automatically, provide it through
% try_to_be_smart_fnc so the calibration can run non-interactively.
long_lat = [20.363427507427865, 69.34818425381995];
t_obs    = [2020, 12, 13, 02, 19, 37.5];

PO_Skibotn.try_to_be_smart_fnc = @(filename) anything2obs(filename,...
                                                          0,...
                                                          'xyz', [0,0,0],...
                                                          'longlat', long_lat,...
                                                          'station', 10,...
                                                          'time', t_obs,...
                                                          'filter', nan,...
                                                          'dt', 0);

%% 8. Run STARCAL
% Launch the interactive geometric calibration on one image from the
% sequence. After STARCAL returns, replace the displayed image with the
% star-enhanced stack to make the fit easier to inspect visually.
SkMp = starcal(exampleFile, PO_Skibotn);
SkMp.img = Dw;
