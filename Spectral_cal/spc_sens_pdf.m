function [N,qAll] = spc_sens_pdf(I_img,I_star,filter_in,filter2wl_order,hist_range)
% SPC_SENS_PDF - Estimate PDF of the sensitivity, from
% star-in-image-intensity I_IMG and star-enrgy-flux-from-catalog
% I_star, FILTER_IN should contain the
% filter identity as given from QWE, and hist_range should be the
% range over which to calculate the histogram.
% 
% See also HIST, SPC_SORT_OUT_THE_BAD_ONES,  SPEC_CAL_BAD_INTENS
%
% Calling:
%  N1 = spc_sens_hist(I_img,I_star,filter_in,hist_range)
% 


%   Copyright � 2008 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later



filters = filter2wl_order;

% disp([iStar])
%for iLambda = 1:length(filters),
for iLambda = 1:length(filters)
  
  N1 = [];

  disp([iLambda filters(iLambda)])
  %for iStar = 1:size(I_star,1),
  for iStar = 1:size(I_star,1)
    
    %TBR?: I1 = [];
    if ~isempty(I_img{iStar,iLambda})
      %disp([iLambda I_star(iStar,iLambda)])
      %I1 = [I_img{iStar,iLambda}/I_star(iStar,iLambda)];
      
      I1 = I_img{iStar,iLambda}/I_star(iStar,iLambda);
      if numel(I1) > 1
        [N1(iStar,:)] = ksdensity(I1,hist_range);
        qAll{iStar,iLambda} = I1;
      else
        N1(iStar,:) = 0;
      end
      
    else
      N1(iStar,:) = 0;
    end
    
  end
  
  N{iLambda} = N1;
  
end
