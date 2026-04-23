function varargout = c_hist(t,x,x_lims,plotstyle)
% C_HIST - colorized 1-D histogram.
% This histogram-variant is intended for creating histograms of signals of
% type X(t) where the independent variable t is somewhat sorted in order
% Instead of simply counting the number of samples in X between each pair
% of bin-limits in X_LIM it extracts the corresponding times into one
% element of the H_X cell-array. That way the number of samples in each
% histogram-bin is the number of elements in the corresponding bin, but the
% information of what times each sample originates from is retained. That
% makes it possible to maintain some additional information about the
% stationarity/non-stationarity of the signal in the plot of the histogram.
% 
% Calling:
%  H_X = c_hist(T,X,X_lims,style)
% Input:
%  T -      independent variable, double array [n_t x 1] or [1 x n_t],
%           typically in an increasing or decreasing order.
%  X -      dependent variable, double array same size as T.
%  X_lims - bin-limits for histogram, double array [n_bins+1 x 1] or 
%           [1 x n_bins], should be a sorted sequence, something like:
%           [min(X):x_step:max(X)]
%  style  - flag to select a normal histogram-plot, or with every bin
%           compressed to between zero and one, which should reveal if the
%           distribution is stationary in the independent variable. To
%           select the zero-2-one compressed histogram-plot, style should
%           either be the string: 'normalized-range' or the scalar int 1.
% 
% Example:
%  % Generate a vector with times, and two toy-signals:
%  t2 = linspace(-2,2,16001);
%  x0 = randn(size(t2)) + 10;  
%  x1 = randn(size(t2)) + 10 + 2*exp(-t2.^2/0.04);    
%  x2 = randn(size(t2))+ 10 + 0.9*exp(-(t2-0.5).^2/0.12) - ...
%                             1.6*exp(-(t2+0.8).^2/0.09);
%  % Plot signal, then colour-coded histogram, normal and normalized:
%  subplot(3,3,1)% 0.25*t2 -0.1*t2.^2 +
%  plot(t2,x1)
%  caxis([-2 2])
%  ch1 = colorbar('southoutside');
%  subplot(3,3,4)
%  c_hist(t2,x1,min(x1):0.25:max(x1),1)
%  subplot(3,3,7)
%  c_hist(t2,x1,min(x1):0.25:max(x1))
%  subplot(3,3,2)
%  plot(t2,x2)
%  caxis([-2 2])
%  ch2 = colorbar('southoutside');
%  subplot(3,3,5)
%  c_hist(t2,x2,min(x2):0.25:max(x2),1)
%  subplot(3,3,8)
%  c_hist(t2,x0,min(x2):0.25:max(x0))
%  subplot(3,3,3)
%  plot(t2,x0)
%  caxis([-2 2])
%  ch3 = colorbar('southoutside');
%  subplot(3,3,6)
%  c_hist(t2,x0,min(x2):0.25:max(x0),1)
%  subplot(3,3,9)
%  c_hist(t2,x0,min(x2):0.25:max(x0))

% Copyright © Björn Gustavsson <bjorn.gustavsson@uit.no>
% This is free software, licensed under GNU GPL version 2 or later

for i1 = (numel(x_lims)-1):-1:1
  idx_curr = (x_lims(i1)< x & x <= x_lims(i1+1));
  H_x{i1} = t(idx_curr);
end

if nargout
  varargout{1} = X_h;
end

if nargin > 3 && (plotstyle == 1 || strcmpi(plotstyle,'normalized-range'))
  plot_dist(H_x,x_lims)
else
  plot_hist(H_x,x_lims)
end

function plot_hist(H_x,x_lims)
for i1 = (numel(x_lims)-1):-1:1
  if ~isempty(H_x{i1})
    pcolor([x_lims(i1) x_lims(i1+1)],...
           0:numel(H_x{i1}),(H_x{i1}([1:end,end]).*[1;1])')
    shading flat
    x_max(i1) = numel(H_x{i1});
  end
  hold on
end
axis([min(x_lims),max(x_lims),0, max(x_max)*1.1])

function plot_dist(H_x,x_lims)
for i1 = (numel(x_lims)-1):-1:1
  if ~isempty(H_x{i1})
    pcolor([x_lims(i1) x_lims(i1+1)],...
           (0:numel(H_x{i1}))/numel(H_x{i1}),(H_x{i1}([1:end,end]).*[1;1])')
    shading flat
  end
  hold on
end
axis([min(x_lims),max(x_lims),0, 1])
