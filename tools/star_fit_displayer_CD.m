function sector_intensities = star_fit_displayer_CD(filenames,BSNRs,PreProcOps,optpar,Opts)
% CLOUD_DETECTOR - 
%   



dOpts.ze_lims   = [0,30,60];
dOpts.nstars    = 6;
dOpts.faintmagn = 4;
dOpts.plot_these_figs = [0 1 0];
dOpts.save_these_figs = [0 0 0];
dOpts.dxy = 1.5;
dOpts.regsize = 10;

results_dir = sprintf('tmp%s-results-%d-%d-%d',...
                      datestr(now,'yyyymmdd-HHMMSS'),...
                      BSNRs(1),...
                      BSNRs(2),...
                      BSNRs(3));
mkdir(results_dir)

if nargin > 3 && ~isempty(Opts)
  dOpts = merge_structs(dOpts,Opts); %#ok<NOPRT> should return value
end

%% Read in a first image
[img,~,obs] = inimg(fullfile(filenames(1).folder,filenames(1).name),PreProcOps);

%% Calculate image-coordinates for azimuth-zenith-grid
%  of sector-boundaries
ze_lims = dOpts.ze_lims*pi/180;
az_360 = linspace(0,2*pi,361);
[az_360,ze_lims] = meshgrid(az_360,ze_lims);
[ua,wa] = project_directions(az_360,ze_lims,optpar,optpar(9),size(img));

%% Define sector boundaries
%  Here we use hard-coded sector-geometry with 4 sectors from
%  zenith with Boundaries at North, East, South and West, and then
%  8 sectors from first zenith-limit to second zenith-limit with
%  boundaries at N, N-E, E, S-E, S, S-W, W and N-W.
% TODO: implement more general boundary layout, possibly with
%  overlapping sectors. /BG-20180912
sector{1} = [ua(1,1),ua(2,1:91),ua(1,1);wa(1,1),wa(2,1:91),wa(1,1)];
sector{2} = [ua(1,1),ua(2,91:181),ua(1,1);wa(1,1),wa(2,91:181),wa(1,1)];
sector{3} = [ua(1,1),ua(2,181:271),ua(1,1);wa(1,1),wa(2,181:271),wa(1,1)];
sector{4} = [ua(1,1),ua(2,271:361),ua(1,1);wa(1,1),wa(2,271:361),wa(1,1)];
for i_sec = 7:-1:0,
  sector{5+i_sec} = [ua(2,i_sec*45+(1:46)),...    % start-first az-row
                  ua(3,i_sec*45+(46:-1:1)),... % return on next ze-level
                  ua(2,i_sec*45+1);            % back to starting point
                  wa(2,i_sec*45+(1:46)),...
                  wa(3,i_sec*45+(46:-1:1)),...
                  wa(2,i_sec*45+1)];
end

%% Load the Bright Star Catalog
star_list = loadstars0(obs.longlat); % make sure this return stars magnitude-sorted
star_list = star_list(star_list(:,2)<=dOpts.faintmagn,:);

[~,idx] = intersect(star_list(:,1),BSNRs)
star_list = star_list(idx,:);
ra   = star_list(:,3);
decl = star_list(:,4);

%% Make space for arrays for the stellar intensities, 
%  one cell for each star in starlist, even though only a fraction, smaller
%  than 1/2 will ever be filled
for i1 = size(star_list,1):-1:1,
  Star_trace{star_list(i1,1)} = [];
end
%% Loop over the images
for i1 = 1:numel(filenames), % swap direction?
  
  %% Load the current image
  if isfield(filenames(i1),'folder')
    currfile = fullfile(filenames(i1).folder,filenames(i1).name);
  else
    currfile = filenames(i1).name;      
  end
  [img,~,obs] = inimg(currfile,PreProcOps);
  %% Calculate current sky-position of stars 
  [stars_azze(1:numel(ra),1),stars_azze(1:numel(ra),2)] = starpos2(ra,...
                                               decl,...
                                               obs.time(1:3),...
                                               obs.time(4:6),...
                                               obs.longlat(2),...
                                               obs.longlat(1));
  stars_azze(:,3) = star_list(:,1)';
  stars_azze(:,4) = star_list(:,2);
  %% Cut out stars with too large zenith-angle
  stars_azze = stars_azze(stars_azze(:,2)<max(ze_lims(:)),:);
  spp{1} = [4*ones(4,2),[3 4 7 8]'];
  spp{2} = [4*ones(4,2),[9 10 13 14]'];
  spp{3} = [4*ones(4,2),[11 12 15 16]'];
  
  %% Search for stars and their image intensities in current image
  idstars = star_int_model_prime(img,...
                                 optpar,...
                                 optpar(9),...
                                 stars_azze,...
                                 spp,...
                                 dOpts); % OPTS);
  subplot(2,2,1)
  img_rgb = imread(currfile);
  imagesc(img_rgb)
  %if max(img(:)) > 1 && size(img,3) == 3
  %  imagesc(uint8(img))
  %else
  %  imagesc(uint8(img))
  %end
  %try
  %  imgs_smart_caxis(0,005,img(:));
  %end
  hold on
  plot_sectors(sector);
  %plot(idstars(:,2),idstars(:,3),'go','markersize',1,'linewidth',2)
  plot(idstars(:,2),idstars(:,3),'go','linewidth',2)
  
% $$$   rfile = fullfile(results_dir,sprintf('%s-star-fits.png',filenames(i1).name));
% $$$   print('-dpng','-painters',rfile)
% $$$   clf
end

%% Subfunctions
function ph = plot_sectors(sectors)

for i1 = numel(sectors):-1:1,
  ph(i1) = plot(sectors{i1}(1,:),sectors{i1}(2,:),'r');
end
