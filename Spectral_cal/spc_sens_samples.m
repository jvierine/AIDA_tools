function [sens_samples] = spc_sens_samples(I_img,I_star,filter2wl_order)


% SPC_SENS_HIST - make histogram with parametrisation and uncertainty
% of the sensitivity, from star-in-image-intensity I_IMG and
% star-enrgy-flux-from-catalog I_star, FILTER_IN should contain the
% filter identity as given from QWE, and hist_range should be the
% range over which to calculate the histogram.
% 
% See also HIST, SPC_SORT_OUT_THE_BAD_ONES,  SPEC_CAL_BAD_INTENS
%
% Calling:
%  [N_all,nP_all,Chi2_all] = spc_sens_hist(I_img,I_star,filter_in,hist_range)
% 

%   Copyright � 20030901 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


% I1 = [];
% N_all = [];
% nP_all = [];

filters = filter2wl_order;

for ii = length(filters):-1:1
  
  disp([ii filters(ii)])
  for jj = size(I_star,1):-1:1
    
    if ~isempty(I_img{jj,ii})
      sens_samples{jj,ii} = I_img{jj,ii}/I_star(jj,ii);
    end
    
  end
  
end
