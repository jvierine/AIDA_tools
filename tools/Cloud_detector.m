function sector_intensities = Cloud_detector(filenames,PreProcOps,optpar,Opts)
% CLOUD_DETECTOR - 
%   



dOpts.ze_lims   = [0,30,60];
dOpts.nstars    = 6;
dOpts.faintmagn = 4;
dOpts.plot_these_figs = [0 1 0];
dOpts.save_these_figs = [0 0 0];
dOpts.dxy = 1.5;
dOpts.regsize = 10;

if nargin > 3 && ~isempty(Opts)
  dOpts = merge_structs(dOpts,Opts) %#ok<NOPRT> should return value
end
progmeter(0,' ')
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
for i_sec = 7:-1:0
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

ra   = star_list(:,3);
decl = star_list(:,4);

%% Make space for arrays for the stellar intensities, 
%  one cell for each star in starlist, even though only a fraction, smaller
%  than 1/2 will ever be filled
for i1 = size(star_list,1):-1:1
  Star_trace{star_list(i1,1)} = [];
end
%% Loop over the images
for i1 = 1:numel(filenames) % swap direction?
  
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
  
  %% Search for stars and their image intensities in current image
  idstars = star_int_search_prime(img,...
                                  optpar,...
                                  optpar(9),...
                                  stars_azze,...
                                  dOpts); % OPTS);
  for i_ids = 1:size(idstars,1)
    %while ~all(ids_secs>=dOpts.nstars)
    sec_CS = 0;i2 = 0;
    uCS = idstars(i_ids,2);
    wCS = idstars(i_ids,3);
    %% Find the sector the star is inside
    while sec_CS == 0 && i2 < numel(sector)
      i2 = i2+1;
      sec_CS = inpolygon(uCS,wCS,sector{i2}(1,:),sector{i2}(2,:));
    end
    if sec_CS ~= 0
      idstars(i_ids,8) = i2;
      %% Save away the intensities, positions sector and time of
      %  current star in last+1 row of cell for current star
      Star_trace{idstars(i_ids,9)}(end+1,:) = [idstars(i_ids,:),obs.time]; %#ok<AGROW> we dont know how many elements
    end
  end
  %% TODO: cut this once the function is tested and accepted
  progmeter(i1/numel(filenames),sprintf('Found %d in image %d out of %d',size(idstars,1),i1,numel(filenames)));

end
progmeter clear

i2 = 1;
for i1 = 1:numel(Star_trace)
  if ~isempty(Star_trace{i1})
    ST{i2} = Star_trace{i1};
    i2 = i2+1;
  end
end
for i0 = numel(ST):-1:1
  magnitudes(i0) = ST{i0}(1,11);
end
[~,i_sm] = sort(magnitudes);
ST = ST(i_sm);
sector_intensities = ST;
keyboard
if dOpts.plot_these_figs(1)
  for i1 = 1:12
    subplot(3,4,i1)
    hold on
  end
  next_pause = ([1 2 2.5 3 3.5 4 4.5 5]);
  inp = 1;
  for i0 = 1:numel(ST)     
    tC = (ST{i0}(:,end-3)-22)*24 + ST{i0}(:,end-2) + ST{i0}(:,end-1)/60 + ST{i0}(:,end)/3600;
    clr = rand(1,3);
    clr = rgb2hsv(clr);
    clr(2) = min(1,1./max(0.01,ST{i0}(1,11)));
    clr = hsv2rgb(clr);
    psz = 22 - 4*ST{i0}(1,11);
    [I_star] = sort(ST{i0}(:,6));
    I_star_clear_sky = I_star(max(1,end-15));
    for iS = 1:12
      iCS = find(ST{i0}(:,8)==iS);
      subplot(3,4,iS)
      %plot(tC(iCS),ST{i0}(iCS,6)/median(ST{i0}(:,6)),'.','color',clr,'markersize',psz)
      plot(tC(iCS),min(2,ST{i0}(iCS,6)/I_star_clear_sky),'.','color',clr,'markersize',psz)
      axis([18 28 0 2])
    end
    title(ST{i0}(1,11))
    drawnow
    if ST{i0}(1,11) > next_pause(inp)
      inp = inp + 1;
      subplot(3,4,1)
      title('push any button to continue')
      pause
    else
      subplot(3,4,1)
      title('')
    end
  end
end

if dOpts.plot_these_figs(2)
  for i1 = 11:-1:1
    tticks{i1} = sprintf('%02d',rem(i1+17,24)');
  end
  
  clr = [1   0   0;  % r
         0   1   0;  % g
         0   1   1;  % c
         0   0   1;  % b
         1   0   1;  % m
         0.4 0.4 0.4;% gray
         0.9 0.5 0;  % orange
         0.6 0   1;  % violet
         0.8 0.2 0;  % brown
         0   0   0;  % black
         0.9 0.9 0;  % yellow
         0.3 0.3 1]; % indigo
  for i0 = 1:numel(ST)
    tC = (ST{i0}(:,end-3)-22)*24 + ST{i0}(:,end-2) + ST{i0}(:,end-1)/60 + ST{i0}(:,end)/3600;
    [I_star] = sort(ST{i0}(:,6));
    I_star_clear_sky = I_star(max(1,round(0.95*end)));
    clf
    ph = [];
    lstr = {};i_l = 1;
    for iS = 1:12
      iCS = find(ST{i0}(:,8)==iS);
      if ~isempty(iCS)
        subplot(2,7,6:7)
        plot(ST{i0}(iCS,2),ST{i0}(iCS,3),'.','color',clr(iS,:),'markersize',15)
        hold on
        plot_sectors(sector);
        %for i1 = 1:numel(sector),
        %  plot(sector{i1}(1,:),sector{i1}(2,:),'r')
        %end
        % TODO-NOORA: test if this is the right modification to do:
        % ax_lims = [1,size(img,2),1,size(img,1)];
        % axis(ax_lims)
        axis([1,457,1,452])
        subplot(2,7,8:12)
        plot(tC(iCS),ST{i0}(iCS,2)-ST{i0}(iCS,16),'g.','markersize',18);
        hold on
        axis([18 28 -5 5])
        set(gca,'xtick',18:28,'xticklabel',tticks)
        plot(tC(iCS),ST{i0}(iCS,3)-ST{i0}(iCS,17),'b.','markersize',18);
        plot(tC(iCS),sqrt(ST{i0}(iCS,13).*ST{i0}(iCS,15)),'r.','markersize',18);
        axis([18 28 -5 5])
        set(gca,'xtick',18:28,'xticklabel',tticks,'ytick',[-5 -2 -1 1 2 5])
        ylabel('Pixels')
        xlabel('Time (UT)')
        title('Horizontal (g) Vertical (b) image shift, star radius(r)')
        grid on
        subplot(2,7,1:5)
        %plot(tC(iCS),ST{i0}(iCS,6)/median(ST{i0}(:,6)),'.','color',clr,'markersize',psz)
        ph(end+1) = plot(tC(iCS),min(2,ST{i0}(iCS,6)/I_star_clear_sky),'.','color',clr(iS,:),'markersize',21);
        axis([18 28 0 2])
        set(gca,'xticklabel',tticks)
        grid on
        hold on
        lstr{i_l} = sprintf('%d',iS);
        i_l = i_l+1;
      end
    end
    title(sprintf('BSNR: %d, magnitude: %f',ST{i0}(1,9),ST{i0}(1,11)))
    ylabel('Normalized-ish intensities')
    legend(ph,lstr)
    drawnow
    if dOpts.save_these_figs(2)
      print('-dpng','-painters',sprintf('star_intensities-%03d.png',i0))
    end
  end
end
if dOpts.plot_these_figs(3)
  for i0 = 1:numel(ST)     
    tC = (ST{i0}(:,end-3)-22)*24 + ST{i0}(:,end-2) + ST{i0}(:,end-1)/60 + ST{i0}(:,end)/3600;
    [I_star] = sort(ST{i0}(:,6));
    I_star_clear_sky = I_star(max(1,end-15));
    clf
    for iS = 1:12
      iCS = find(ST{i0}(:,8)==iS);
      if ~isempty(iCS)
        plot(tC(iCS),min(2,ST{i0}(iCS,6)/I_star_clear_sky),'.','color',clr(iS,:),'markersize',18)
        axis([18 28 0 2])
        hold on
      end
    end
    title(ST{i0}(1,11))
    disp('push any button to continue')
    pause
  end
end

%% Subfunctions
function ph = plot_sectors(sectors)

for i1 = numel(sectors):-1:1
  ph(i1) = plot(sectors{i1}(1,:),sectors{i1}(2,:),'r');
end
