function [ph] = spc_cal_plot_star(starID,plotPar,IDSTARS,OPTS)
% Needs to be redocumented!
% SPC_CAL_BAD_TIMES - Screen out bad time periods for each star
% due to clouds or other problems. The function will plot the
% stellar intensities as a function of time, if there is periods
% where the intensities are noticeably reduced it is possible to
% de-select those time-periods, for each individual star.
% 
% Calling:
%  [BadTimes,sis] = spc_cal_bad_times(IDSTARS,time_s,filtnr,optpar,OPTS)
% Inputs:
%  IDSTARS - Identified stars, as produced by SPC_SCAN_FOR_STARS
%  TIME_S  - Times for corresponding stars
%  FILTNR  - Filter index for corresponding stars
%  OPTPAR  - Optical parameters of imager (See CAMERA)
%  OPTS    - Options struct, filed 'clrs', default 'grmmkbcccc'
% 
% Output:
%  BadTimes - bad time periods for each star,
%  SIS - star index (?) for corresponding stars

%   Copyright © 20030901 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later



% If the user supplies a definition of what colours to use for each
% filter use them:
%if nargin>=5 & isfield(OPTS,'clrs')
%  clrs = OPTS.clrs;
%end
% Adapt for colours defined as char-array or rgb-array.
%if ischar(clrs(1))
%  clrsIDX = 1;
%else
%  clrsIDX = 1:3;
%end
% get the unique Bright star catalog number we have

% Get the observations of the requested star
idx_curr = (IDSTARS(:,9) == starID);
% idx_curr = (IDSTARS(:,9) == starID & IDSTARS(:,4)>0);
CurrStar = IDSTARS(idx_curr,:);
currTime = IDSTARS(idx_curr,end);
currUobs = IDSTARS(idx_curr,2);
currVobs = IDSTARS(idx_curr,3);
currU_0 = IDSTARS(idx_curr,12);
currV_0 = IDSTARS(idx_curr,13);
curr_sU = IDSTARS(idx_curr,14);
curr_sV = IDSTARS(idx_curr,16);
curr_dl = ((currU_0-currUobs).^2 + (currV_0-currVobs).^2).^.5;
currFilts = IDSTARS(idx_curr,18);

if nargin > 3 && isfield(OPTS,'dlMax')
  CurrStar = CurrStar(curr_dl<=OPTS.dlMax,:);
  currTime = currTime(curr_dl<=OPTS.dlMax);
  currUobs = currUobs(curr_dl<=OPTS.dlMax);
  currVobs = currVobs(curr_dl<=OPTS.dlMax);
  currU_0 = currU_0(curr_dl<=OPTS.dlMax);
  currV_0 = currV_0(curr_dl<=OPTS.dlMax);
  curr_sU = curr_sU(curr_dl<=OPTS.dlMax);
  curr_sV = curr_sV(curr_dl<=OPTS.dlMax);
  curr_dl = curr_dl(curr_dl<=OPTS.dlMax);
  currFilts = currFilts(curr_dl<=OPTS.dlMax);
end
% Get the filters that has been used in those observations
% work with this star.
uFilts = unique(currFilts);
%figure
for iSF = numel(unique(currFilts)):-1:1
  subplot(numel(unique(currFilts))+2,1,iSF+2)
  if iSF == 1
    title([' BSNR = ',num2str(starID)])
  end
  i_currF = find(currFilts == uFilts(iSF));
  ph(iSF+2) = scatter(currTime(i_currF),...
                      CurrStar(i_currF,plotPar),...
                      22./( 1 + curr_sU(i_currF).*curr_sV(i_currF)),...
                      1./( 0.1 + curr_dl(i_currF) ),...
                      'filled');
end
subplot(numel(unique(currFilts))+2,1,2)
ph(2) = scatter(currTime(i_currF),...
                curr_sU(i_currF).*curr_sV(i_currF),...
                22,...
                22./( 1 + curr_sU(i_currF).*curr_sV(i_currF)),...
                'filled');
ylabel('\sigma_u\sigma_v')
subplot(numel(unique(currFilts))+2,1,1)

ph(1) = scatter(currTime(i_currF),...
                curr_dl(i_currF),...
                22,...
                1./( 0.1 + curr_dl(i_currF) ),...
                'filled');
ylabel('dl')